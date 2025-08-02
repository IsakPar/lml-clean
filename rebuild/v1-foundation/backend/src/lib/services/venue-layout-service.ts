/**
 * LML v1 Foundation - Venue Layout Service
 * =========================================
 * Business logic for venue layout management
 * Created: 2025-08-02
 * Status: Phase 2 - Enterprise Service Layer
 */

import { ObjectId } from 'mongodb';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getVenueLayoutsCollection } from '../db/mongodb';
import type {
  VenueLayout,
  VenueLayoutSummary,
  VenueLayoutResponse,
  VenueLayoutListResponse,
  CDNLayoutExport,
  LayoutValidationResult,
  ValidationError
} from '../types/venue-layout';
import {
  validateVenueLayout,
  validateSeatUniqueness,
  validateSeatCoordinates,
  validateAccessibilityCompliance
} from '../validation/venue-layout-schemas';

// ================================================
// SERVICE CLASS
// ================================================

export class VenueLayoutService {
  
  // ================================================
  // CREATE OPERATIONS
  // ================================================

  async createVenueLayout(layoutData: Omit<VenueLayout, 'layout_id' | 'layout_hash' | 'created_at' | 'updated_at' | 'file_size_kb'>): Promise<VenueLayoutResponse> {
    console.log('🏗️ Creating new venue layout...');
    
    try {
      // Generate UUID and timestamps
      const layout_id = uuidv4();
      const now = new Date();
      
      // Compute file size (approximate JSON size in KB)
      const tempLayout = { ...layoutData, layout_id, created_at: now, updated_at: now };
      const file_size_kb = Math.ceil(JSON.stringify(tempLayout).length / 1024);
      
      // Compute layout hash for cache invalidation
      const layout_hash = this.computeLayoutHash(tempLayout);
      
      // Build complete layout object
      const completeLayout: VenueLayout = {
        ...layoutData,
        layout_id,
        layout_hash,
        created_at: now,
        updated_at: now,
        file_size_kb
      };
      
      // Validate the complete layout
      const validation = this.validateLayout(completeLayout);
      if (!validation.valid) {
        throw new Error(`Layout validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }
      
      // Insert into MongoDB
      const collection = await getVenueLayoutsCollection();
      const result = await collection.insertOne(completeLayout);
      
      if (!result.acknowledged) {
        throw new Error('Failed to insert layout into database');
      }
      
      console.log(`✅ Layout created with ID: ${layout_id}`);
      
      return {
        layout: completeLayout,
        metadata: {
          last_modified: completeLayout.updated_at.toISOString(),
          performance_metrics: {
            file_size_kb: completeLayout.file_size_kb,
            generation_time_ms: Date.now() - now.getTime()
          }
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to create venue layout:', error);
      throw error;
    }
  }

  // ================================================
  // READ OPERATIONS
  // ================================================

  async getVenueLayout(layout_id: string): Promise<VenueLayoutResponse | null> {
    console.log(`🔍 Fetching venue layout: ${layout_id}`);
    
    try {
      const collection = await getVenueLayoutsCollection();
      const layout = await collection.findOne({ layout_id }) as VenueLayout | null;
      
      if (!layout) {
        console.log(`❌ Layout not found: ${layout_id}`);
        return null;
      }
      
      console.log(`✅ Layout found: ${layout_id}`);
      
      return {
        layout,
        metadata: {
          last_modified: layout.updated_at.toISOString(),
          cdn_version: layout.cdn_url ? layout.layout_version : undefined
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to fetch venue layout:', error);
      throw error;
    }
  }

  async listVenueLayouts(options: {
    venue_id?: string;
    layout_status?: 'draft' | 'active' | 'deprecated';
    page?: number;
    limit?: number;
    sort_by?: 'created_at' | 'updated_at' | 'layout_version';
    sort_order?: 'asc' | 'desc';
  } = {}): Promise<VenueLayoutListResponse> {
    console.log('📋 Listing venue layouts with options:', options);
    
    try {
      const {
        venue_id,
        layout_status,
        page = 1,
        limit = 20,
        sort_by = 'updated_at',
        sort_order = 'desc'
      } = options;
      
      // Build MongoDB filter
      const filter: any = {};
      if (venue_id) filter.venue_id = venue_id;
      if (layout_status) filter.layout_status = layout_status;
      
      // Build sort options
      const sort: any = {};
      sort[sort_by] = sort_order === 'desc' ? -1 : 1;
      
      const collection = await getVenueLayoutsCollection();
      
      // Get total count for pagination
      const total = await collection.countDocuments(filter);
      
      // Get paginated results
      const skip = (page - 1) * limit;
      const layouts = await collection
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .project({
          layout_id: 1,
          venue_id: 1,
          layout_version: 1,
          layout_status: 1,
          created_at: 1,
          total_seats: 1,
          file_size_kb: 1
        })
        .toArray() as VenueLayoutSummary[];
      
      console.log(`✅ Found ${layouts.length} layouts (${total} total)`);
      
      return {
        layouts,
        pagination: {
          total,
          page,
          limit
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to list venue layouts:', error);
      throw error;
    }
  }

  // ================================================
  // UPDATE OPERATIONS
  // ================================================

  async updateVenueLayout(
    layout_id: string, 
    updateData: Partial<Omit<VenueLayout, 'layout_id' | 'created_at' | 'layout_hash' | 'file_size_kb'>>
  ): Promise<VenueLayoutResponse | null> {
    console.log(`🔄 Updating venue layout: ${layout_id}`);
    
    try {
      const collection = await getVenueLayoutsCollection();
      
      // Get existing layout
      const existingLayout = await collection.findOne({ layout_id }) as VenueLayout | null;
      if (!existingLayout) {
        console.log(`❌ Layout not found for update: ${layout_id}`);
        return null;
      }
      
      // Merge updates
      const updatedLayout: VenueLayout = {
        ...existingLayout,
        ...updateData,
        updated_at: new Date()
      };
      
      // Recompute hash and file size
      updatedLayout.layout_hash = this.computeLayoutHash(updatedLayout);
      updatedLayout.file_size_kb = Math.ceil(JSON.stringify(updatedLayout).length / 1024);
      
      // Validate updated layout
      const validation = this.validateLayout(updatedLayout);
      if (!validation.valid) {
        throw new Error(`Layout validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }
      
      // Update in database
      const result = await collection.replaceOne(
        { layout_id },
        updatedLayout
      );
      
      if (result.matchedCount === 0) {
        throw new Error('No layout found to update');
      }
      
      console.log(`✅ Layout updated: ${layout_id}`);
      
      return {
        layout: updatedLayout,
        metadata: {
          last_modified: updatedLayout.updated_at.toISOString(),
          performance_metrics: {
            file_size_kb: updatedLayout.file_size_kb,
            generation_time_ms: Date.now() - updatedLayout.updated_at.getTime()
          }
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to update venue layout:', error);
      throw error;
    }
  }

  // ================================================
  // DELETE OPERATIONS
  // ================================================

  async deleteVenueLayout(layout_id: string): Promise<boolean> {
    console.log(`🗑️ Deleting venue layout: ${layout_id}`);
    
    try {
      const collection = await getVenueLayoutsCollection();
      
      // Check if layout exists and is deletable (only draft layouts)
      const existingLayout = await collection.findOne({ layout_id }) as VenueLayout | null;
      if (!existingLayout) {
        console.log(`❌ Layout not found for deletion: ${layout_id}`);
        return false;
      }
      
      if (existingLayout.layout_status !== 'draft') {
        throw new Error(`Cannot delete ${existingLayout.layout_status} layout. Only draft layouts can be deleted.`);
      }
      
      // Delete the layout
      const result = await collection.deleteOne({ layout_id });
      
      if (result.deletedCount === 0) {
        throw new Error('Failed to delete layout');
      }
      
      console.log(`✅ Layout deleted: ${layout_id}`);
      return true;
      
    } catch (error) {
      console.error('❌ Failed to delete venue layout:', error);
      throw error;
    }
  }

  // ================================================
  // LIFECYCLE OPERATIONS
  // ================================================

  async promoteLayoutToDraft(layout_id: string): Promise<VenueLayoutResponse | null> {
    return this.updateLayoutStatus(layout_id, 'draft');
  }

  async promoteLayoutToActive(layout_id: string): Promise<VenueLayoutResponse | null> {
    return this.updateLayoutStatus(layout_id, 'active');
  }

  async deprecateLayout(layout_id: string): Promise<VenueLayoutResponse | null> {
    return this.updateLayoutStatus(layout_id, 'deprecated');
  }

  private async updateLayoutStatus(layout_id: string, new_status: 'draft' | 'active' | 'deprecated'): Promise<VenueLayoutResponse | null> {
    console.log(`🔄 Updating layout status: ${layout_id} → ${new_status}`);
    
    return this.updateVenueLayout(layout_id, {
      layout_status: new_status
    });
  }

  // ================================================
  // CDN EXPORT
  // ================================================

  async exportLayoutForCDN(layout_id: string): Promise<CDNLayoutExport | null> {
    console.log(`🌐 Exporting layout for CDN: ${layout_id}`);
    
    try {
      const layoutResponse = await this.getVenueLayout(layout_id);
      if (!layoutResponse) {
        return null;
      }
      
      const { layout } = layoutResponse;
      
      // Create CDN-optimized export
      const cdnExport: CDNLayoutExport = {
        layout_id: layout.layout_id,
        layout_version: layout.layout_version,
        layout_hash: layout.layout_hash,
        viewport: layout.viewport,
        sections: layout.sections.map(section => ({
          section_id: section.section_id,
          section_name: section.section_name,
          section_type: section.section_type,
          display_order: section.display_order,
          background_color: section.background_color,
          seats: section.seats.map(seat => ({
            seat_id: seat.seat_id,
            row: seat.row,
            number: seat.number,
            x: seat.x,
            y: seat.y,
            width: seat.width,
            height: seat.height,
            seat_type: seat.seat_type,
            accessibility_features: seat.accessibility_features,
            shape: seat.shape
          }))
        })),
        exported_at: new Date().toISOString(),
        cache_control: 'public, max-age=86400' // 24 hours
      };
      
      console.log(`✅ CDN export ready for: ${layout_id}`);
      return cdnExport;
      
    } catch (error) {
      console.error('❌ Failed to export layout for CDN:', error);
      throw error;
    }
  }

  // ================================================
  // VALIDATION & UTILITY
  // ================================================

  validateLayout(layout: VenueLayout): LayoutValidationResult {
    const errors: ValidationError[] = [];
    
    // Schema validation
    const schemaValidation = validateVenueLayout(layout);
    if (!schemaValidation.success) {
      errors.push(...schemaValidation.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        severity: 'error' as const
      })));
    }
    
    // Business rule validation
    const seatUniquenessErrors = validateSeatUniqueness(layout);
    errors.push(...seatUniquenessErrors.map(msg => ({
      field: 'seats',
      message: msg,
      severity: 'error' as const
    })));
    
    const coordinateErrors = validateSeatCoordinates(layout);
    errors.push(...coordinateErrors.map(msg => ({
      field: 'seats.coordinates',
      message: msg,
      severity: 'error' as const
    })));
    
    const accessibilityErrors = validateAccessibilityCompliance(layout);
    errors.push(...accessibilityErrors.map(msg => ({
      field: 'accessibility',
      message: msg,
      severity: 'warning' as const
    })));
    
    // Performance scoring (0-100)
    let performance_score = 100;
    if (layout.file_size_kb > 500) performance_score -= 20; // Large file penalty
    if (layout.total_seats > 5000) performance_score -= 10; // Complexity penalty
    if (layout.sections.length > 20) performance_score -= 10; // Too many sections
    
    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings: errors.filter(e => e.severity === 'warning'),
      performance_score: Math.max(0, performance_score)
    };
  }

  private computeLayoutHash(layout: Partial<VenueLayout>): string {
    // Create a stable string representation for hashing
    const hashData = {
      venue_id: layout.venue_id,
      layout_version: layout.layout_version,
      viewport: layout.viewport,
      sections: layout.sections
    };
    
    const hashString = JSON.stringify(hashData, Object.keys(hashData).sort());
    return createHash('sha256').update(hashString).digest('hex');
  }

  // ================================================
  // HEALTH CHECK
  // ================================================

  async healthCheck(): Promise<{ status: string; count: number }> {
    try {
      const collection = await getVenueLayoutsCollection();
      const count = await collection.countDocuments();
      
      return {
        status: 'healthy',
        count
      };
    } catch (error) {
      console.error('❌ Venue layout service health check failed:', error);
      return {
        status: 'error',
        count: -1
      };
    }
  }
}

// Export singleton instance
export const venueLayoutService = new VenueLayoutService();