/**
 * LML v1 Foundation - Layout CRUD Operations
 * ==========================================
 * Core database operations for venue layouts with cache invalidation
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture (Fix #1: Cache Invalidation)
 */

import { Db, MongoClient } from 'mongodb';
import { 
  VenueLayout, 
  CreateLayoutRequest, 
  UpdateLayoutRequest,
  ServiceOperationResult,
  LayoutServiceError,
  LayoutNotFoundError
} from '../config/schema-definitions';
import { generateLayoutHash } from '../utils/hash-generator';
import { invalidateLayoutCache } from '../cache/layout-cache';
import { purgeCDNLayout } from '../utils/cdn-purger';
import { recordOperationDuration } from '../health/metrics-collector';

// ================================================
// MONGODB CONNECTION UTILITIES
// ================================================

async function connectMongoDB<T>(operation: (db: Db) => Promise<T>): Promise<T> {
  let client: MongoClient | null = null;
  
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI environment variable required');
    
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      maxPoolSize: 10,
      retryWrites: true,
    });
    
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'lml_seatmaps');
    return await operation(db);
    
  } finally {
    if (client) {
      await client.close().catch(console.warn);
    }
  }
}

// ================================================
// CORE CRUD OPERATIONS
// ================================================

/**
 * Create a new venue layout
 */
export async function createLayout(
  request: CreateLayoutRequest
): Promise<ServiceOperationResult<VenueLayout>> {
  const startTime = Date.now();
  const operationId = `create-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Generate layout hash for deduplication
    const layoutHash = generateLayoutHash({
      seats: request.seats,
      sections: request.sections,
      zones: request.zones,
      viewport: request.viewport,
    });
    
    // Create layout document
    const layoutId = `layout-${Date.now()}-${crypto.randomUUID()}`;
    const now = new Date();
    
    const layout: VenueLayout = {
      layoutId,
      venueId: request.venueId,
      organizationId: request.organizationId,
      name: request.name,
      version: '1.0.0', // Initial version
      layoutHash,
      layoutType: request.layoutType,
      status: 'draft',
      seats: request.seats,
      sections: request.sections || [],
      zones: request.zones || [],
      viewport: request.viewport,
      description: request.description,
      tags: request.tags || [],
      createdAt: now,
      updatedAt: now,
      createdBy: request.createdBy,
      updatedBy: request.createdBy,
      isValid: true,
      isActiveVersion: true,
    };
    
    // Insert into database
    const result = await connectMongoDB(async (db) => {
      const collection = db.collection<VenueLayout>('venue_layouts');
      
      // Check for duplicate hash (Fix #3: Hash enforcement)
      const existingLayout = await collection.findOne({ 
        layoutHash,
        venueId: request.venueId 
      });
      
      if (existingLayout) {
        throw new LayoutServiceError(
          'Layout with identical content already exists',
          'DUPLICATE_LAYOUT',
          { existingLayoutId: existingLayout.layoutId }
        );
      }
      
      await collection.insertOne(layout);
      return layout;
    });
    
    // Record metrics
    recordOperationDuration('layout.create', Date.now() - startTime);
    
    return {
      success: true,
      data: result,
      operationId,
      timestamp: new Date(),
    };
    
  } catch (error) {
    recordOperationDuration('layout.create.error', Date.now() - startTime);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operationId,
      timestamp: new Date(),
    };
  }
}

/**
 * Get layout by venue ID
 */
export async function getLayoutByVenueId(
  venueId: string
): Promise<ServiceOperationResult<VenueLayout | null>> {
  const startTime = Date.now();
  const operationId = `get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const result = await connectMongoDB(async (db) => {
      const collection = db.collection<VenueLayout>('venue_layouts');
      return await collection.findOne({ 
        venueId,
        isActiveVersion: true,
        status: { $ne: 'archived' }
      });
    });
    
    recordOperationDuration('layout.get', Date.now() - startTime);
    
    return {
      success: true,
      data: result,
      operationId,
      timestamp: new Date(),
    };
    
  } catch (error) {
    recordOperationDuration('layout.get.error', Date.now() - startTime);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operationId,
      timestamp: new Date(),
    };
  }
}

/**
 * Update an existing layout with cache invalidation (Fix #1)
 */
export async function updateLayout(
  request: UpdateLayoutRequest
): Promise<ServiceOperationResult<VenueLayout>> {
  const startTime = Date.now();
  const operationId = `update-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const result = await connectMongoDB(async (db) => {
      const collection = db.collection<VenueLayout>('venue_layouts');
      
      // Get existing layout
      const existingLayout = await collection.findOne({ 
        layoutId: request.layoutId,
        isActiveVersion: true 
      });
      
      if (!existingLayout) {
        throw new LayoutNotFoundError(request.layoutId);
      }
      
      // Prepare updates
      const updates: Partial<VenueLayout> = {
        updatedAt: new Date(),
        updatedBy: request.updatedBy,
      };
      
      if (request.name) updates.name = request.name;
      if (request.description) updates.description = request.description;
      if (request.tags) updates.tags = request.tags;
      if (request.seats) updates.seats = request.seats;
      if (request.sections) updates.sections = request.sections;
      if (request.zones) updates.zones = request.zones;
      if (request.viewport) updates.viewport = request.viewport;
      
      // Regenerate hash if layout data changed
      if (request.seats || request.sections || request.zones || request.viewport) {
        updates.layoutHash = generateLayoutHash({
          seats: request.seats || existingLayout.seats,
          sections: request.sections || existingLayout.sections,
          zones: request.zones || existingLayout.zones,
          viewport: request.viewport || existingLayout.viewport,
        });
      }
      
      // Update in database
      const updateResult = await collection.findOneAndUpdate(
        { layoutId: request.layoutId, isActiveVersion: true },
        { $set: updates },
        { returnDocument: 'after' }
      );
      
      if (!updateResult) {
        throw new LayoutServiceError('Failed to update layout', 'UPDATE_FAILED');
      }
      
      return updateResult;
    });
    
    // Fix #1: Invalidate cache after successful update
    await invalidateLayoutCache(result.venueId);
    
    // Fix #2: Purge CDN cache
    await purgeCDNLayout(result.venueId);
    
    recordOperationDuration('layout.update', Date.now() - startTime);
    
    return {
      success: true,
      data: result,
      operationId,
      timestamp: new Date(),
    };
    
  } catch (error) {
    recordOperationDuration('layout.update.error', Date.now() - startTime);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operationId,
      timestamp: new Date(),
    };
  }
}

/**
 * Delete layout (soft delete) with cache invalidation (Fix #1)
 */
export async function deleteLayout(
  layoutId: string,
  deletedBy: string,
  reason?: string
): Promise<ServiceOperationResult<boolean>> {
  const startTime = Date.now();
  const operationId = `delete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const result = await connectMongoDB(async (db) => {
      const collection = db.collection<VenueLayout>('venue_layouts');
      
      // Get layout for cache invalidation
      const layout = await collection.findOne({ layoutId, isActiveVersion: true });
      if (!layout) {
        throw new LayoutNotFoundError(layoutId);
      }
      
      // Soft delete
      await collection.updateOne(
        { layoutId, isActiveVersion: true },
        { 
          $set: { 
            status: 'archived',
            archivedAt: new Date(),
            updatedBy: deletedBy,
            updatedAt: new Date(),
          }
        }
      );
      
      // Fix #1: Invalidate cache after deletion
      await invalidateLayoutCache(layout.venueId);
      
      // Fix #2: Purge CDN
      await purgeCDNLayout(layout.venueId);
      
      return true;
    });
    
    recordOperationDuration('layout.delete', Date.now() - startTime);
    
    return {
      success: true,
      data: result,
      operationId,
      timestamp: new Date(),
    };
    
  } catch (error) {
    recordOperationDuration('layout.delete.error', Date.now() - startTime);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operationId,
      timestamp: new Date(),
    };
  }
}

/**
 * List layouts for an organization
 */
export async function listLayoutsByOrganization(
  organizationId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ServiceOperationResult<VenueLayout[]>> {
  const startTime = Date.now();
  const operationId = `list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const result = await connectMongoDB(async (db) => {
      const collection = db.collection<VenueLayout>('venue_layouts');
      return await collection
        .find({ 
          organizationId,
          isActiveVersion: true,
          status: { $ne: 'archived' }
        })
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    });
    
    recordOperationDuration('layout.list', Date.now() - startTime);
    
    return {
      success: true,
      data: result,
      operationId,
      timestamp: new Date(),
    };
    
  } catch (error) {
    recordOperationDuration('layout.list.error', Date.now() - startTime);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      operationId,
      timestamp: new Date(),
    };
  }
}