/**
 * LML v1 Foundation - VenueLayout Service Orchestrator
 * ====================================================
 * Enterprise-grade venue layout service with dependency injection
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture
 */

// ================================================
// EXPORT ALL PUBLIC TYPES AND INTERFACES
// ================================================

export * from './config/schema-definitions';
export * from './config/service-config';

// ================================================
// EXPORT CORE OPERATIONS
// ================================================

export {
  createLayout,
  getLayoutByVenueId,
  updateLayout,
  deleteLayout,
  listLayoutsByOrganization,
} from './operations/layout-crud';

// ================================================
// EXPORT CACHE OPERATIONS
// ================================================

export {
  getCachedLayout,
  setCachedLayout,
  invalidateLayoutCache,
  warmLikelyVenueCaches,
  warmLayoutCache,
  getCacheStatistics,
  resolveLayoutTTL,
} from './cache/layout-cache';

// ================================================
// EXPORT UTILITIES
// ================================================

export {
  generateLayoutHash,
  generateLayoutHashWithMetadata,
  validateLayoutHash,
  areLayoutsIdentical,
  compareLayoutHashes,
  generateShortHash,
  isValidHashFormat,
} from './utils/hash-generator';

export {
  purgeCDNLayout,
  purgeCDNLayouts,
  purgeAllLayoutCache,
  testCDNConnectivity,
  checkCDNPurgeStatus,
} from './utils/cdn-purger';

// ================================================
// EXPORT METRICS AND HEALTH
// ================================================

export {
  recordLayoutCacheHit,
  recordLayoutCacheMiss,
  recordOperationDuration,
  recordPublishDuration,
  recordLayoutCreation,
  recordLayoutUpdate,
  recordLayoutPublish,
  getAllMetrics,
  getMetricsForDashboard,
  getHealthMetrics,
  resetMetrics,
} from './health/metrics-collector';

// ================================================
// SERVICE CLASS ORCHESTRATOR
// ================================================

import {
  VenueLayout,
  CreateLayoutRequest,
  UpdateLayoutRequest,
  PublishLayoutRequest,
  ServiceOperationResult,
} from './config/schema-definitions';
import { getVenueLayoutServiceConfig, VenueLayoutServiceConfig } from './config/service-config';
import * as crud from './operations/layout-crud';
import * as cache from './cache/layout-cache';
import * as cdn from './utils/cdn-purger';
import * as metrics from './health/metrics-collector';

/**
 * Enterprise-grade VenueLayout Service with dependency injection
 */
export class VenueLayoutService {
  private config: VenueLayoutServiceConfig;

  constructor(config?: Partial<VenueLayoutServiceConfig>) {
    this.config = config 
      ? { ...getVenueLayoutServiceConfig(), ...config }
      : getVenueLayoutServiceConfig();
  }

  // ================================================
  // CRUD OPERATIONS
  // ================================================

  /**
   * Create a new venue layout
   */
  async createLayout(request: CreateLayoutRequest): Promise<ServiceOperationResult<VenueLayout>> {
    metrics.recordLayoutCreation(request.venueId, request.layoutType);
    return crud.createLayout(request);
  }

  /**
   * Get layout by venue ID (with caching)
   */
  async getLayout(venueId: string): Promise<ServiceOperationResult<VenueLayout | null>> {
    // Try cache first if enabled
    if (this.config.cache.enabled) {
      const cached = await cache.getCachedLayout(venueId);
      if (cached) {
        return {
          success: true,
          data: cached,
          operationId: `cache-hit-${Date.now()}`,
          timestamp: new Date(),
        };
      }
    }

    // Fetch from database
    const result = await crud.getLayoutByVenueId(venueId);
    
    // Cache the result if successful
    if (result.success && result.data && this.config.cache.enabled) {
      await cache.setCachedLayout(venueId, result.data);
    }

    return result;
  }

  /**
   * Update an existing layout
   */
  async updateLayout(request: UpdateLayoutRequest): Promise<ServiceOperationResult<VenueLayout>> {
    const result = await crud.updateLayout(request);
    
    if (result.success && result.data) {
      metrics.recordLayoutUpdate(result.data.venueId, 'content_update');
    }
    
    return result;
  }

  /**
   * Delete a layout (soft delete)
   */
  async deleteLayout(layoutId: string, deletedBy: string, reason?: string): Promise<ServiceOperationResult<boolean>> {
    return crud.deleteLayout(layoutId, deletedBy, reason);
  }

  /**
   * List layouts for an organization
   */
  async listLayouts(
    organizationId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<ServiceOperationResult<VenueLayout[]>> {
    return crud.listLayoutsByOrganization(organizationId, limit, offset);
  }

  // ================================================
  // CACHE OPERATIONS
  // ================================================

  /**
   * Warm cache for predicted venues (Fix #6: Predictive Caching)
   */
  async warmPredictiveCaches(userId: string): Promise<void> {
    if (this.config.predictive.enabled) {
      await cache.warmLikelyVenueCaches(userId);
    }
  }

  /**
   * Invalidate cache for venue
   */
  async invalidateCache(venueId: string): Promise<void> {
    await cache.invalidateLayoutCache(venueId);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    return cache.getCacheStatistics();
  }

  // ================================================
  // CDN OPERATIONS
  // ================================================

  /**
   * Purge layout from CDN
   */
  async purgeCDN(venueId: string): Promise<any> {
    if (this.config.cdn.enabled) {
      return cdn.purgeCDNLayout(venueId);
    }
    return { success: true, provider: 'disabled' };
  }

  /**
   * Test CDN connectivity
   */
  async testCDN(): Promise<any> {
    return cdn.testCDNConnectivity();
  }

  // ================================================
  // HEALTH AND METRICS
  // ================================================

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    services: Record<string, boolean>;
    metrics: any;
  }> {
    const healthMetrics = metrics.getHealthMetrics();
    
    return {
      healthy: healthMetrics.isHealthy,
      services: {
        database: true, // TODO: Add database health check
        cache: this.config.cache.enabled,
        cdn: this.config.cdn.enabled,
        metrics: this.config.metrics.enabled,
      },
      metrics: healthMetrics,
    };
  }

  /**
   * Get service metrics for monitoring
   */
  getMetrics(): any {
    return metrics.getMetricsForDashboard();
  }

  /**
   * Get service configuration
   */
  getConfig(): VenueLayoutServiceConfig {
    return this.config;
  }
}

// ================================================
// DEFAULT SERVICE INSTANCE
// ================================================

/**
 * Default service instance for easy consumption
 */
export const venueLayoutService = new VenueLayoutService();

// ================================================
// CONVENIENCE FUNCTIONS
// ================================================

/**
 * Quick layout creation
 */
export async function quickCreateLayout(request: CreateLayoutRequest): Promise<ServiceOperationResult<VenueLayout>> {
  return venueLayoutService.createLayout(request);
}

/**
 * Quick layout retrieval with caching
 */
export async function quickGetLayout(venueId: string): Promise<VenueLayout | null> {
  const result = await venueLayoutService.getLayout(venueId);
  return result.data || null;
}

/**
 * Quick cache warming for user
 */
export async function quickWarmUserCache(userId: string): Promise<void> {
  await venueLayoutService.warmPredictiveCaches(userId);
}

// ================================================
// SERVICE FACTORY
// ================================================

/**
 * Create a custom VenueLayoutService with specific configuration
 */
export function createVenueLayoutService(config?: Partial<VenueLayoutServiceConfig>): VenueLayoutService {
  return new VenueLayoutService(config);
}

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

/**
 * Graceful shutdown for the venue layout service
 */
export async function shutdownVenueLayoutService(): Promise<void> {
  try {
    await cache.shutdownLayoutCache();
    console.log('✅ VenueLayoutService shutdown complete');
  } catch (error) {
    console.error('Error during VenueLayoutService shutdown:', error);
  }
}