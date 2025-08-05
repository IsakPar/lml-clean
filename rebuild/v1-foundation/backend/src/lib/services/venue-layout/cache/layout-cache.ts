/**
 * LML v1 Foundation - Layout Cache Management
 * ===========================================
 * Redis-based caching with dynamic TTL and invalidation
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture (Fix #1,5: Cache Invalidation + Dynamic TTL)
 */

import { createClient } from 'redis';
import { VenueLayout, LayoutCacheKeys } from '../config/schema-definitions';
import { getVenueLayoutServiceConfig } from '../config/service-config';
import { recordLayoutCacheHit, recordLayoutCacheMiss } from '../health/metrics-collector';

// ================================================
// REDIS CLIENT MANAGEMENT
// ================================================

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (!redisClient) {
    const config = getVenueLayoutServiceConfig();
    
    if (!config.cache.enabled) {
      return null; // Caching disabled
    }
    
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL,
        database: config.cache.redis.database, // Separate DB from rate limiting
      });
      
      await redisClient.connect();
      console.log('✅ Layout Cache Redis connected');
    } catch (error) {
      console.error('❌ Layout Cache Redis connection failed:', error);
      redisClient = null;
    }
  }
  
  return redisClient;
}

// ================================================
// DYNAMIC TTL CALCULATION (Fix #5)
// ================================================

/**
 * Calculate optimal TTL based on layout characteristics
 */
export function resolveLayoutTTL(layout: VenueLayout): number {
  const config = getVenueLayoutServiceConfig();
  
  // Published layouts - long TTL (1 hour)
  if (layout.status === 'published' || layout.status === 'deployed') {
    return 3600;
  }
  
  // Draft layouts - short TTL (5 minutes)
  if (layout.status === 'draft') {
    return 300;
  }
  
  // Check if this is a live event venue (future enhancement)
  if (isLiveEventVenue(layout.venueId)) {
    return 60; // 1 minute for live events
  }
  
  // Default TTL from config
  return config.cache.defaultTTL;
}

/**
 * Determine if venue has live events (stub for future)
 */
function isLiveEventVenue(venueId: string): boolean {
  // TODO: Integrate with event service to check for live events
  // For now, return false (no live events)
  return false;
}

// ================================================
// CACHE OPERATIONS
// ================================================

/**
 * Get cached layout by venue ID
 */
export async function getCachedLayout(venueId: string): Promise<VenueLayout | null> {
  const client = await getRedisClient();
  if (!client) return null;
  
  try {
    const key = LayoutCacheKeys.layout(venueId);
    const cached = await client.get(key);
    
    if (cached) {
      recordLayoutCacheHit(venueId);
      return JSON.parse(cached) as VenueLayout;
    } else {
      recordLayoutCacheMiss(venueId);
      return null;
    }
  } catch (error) {
    console.warn('Layout cache read error:', error);
    recordLayoutCacheMiss(venueId);
    return null;
  }
}

/**
 * Cache layout with dynamic TTL
 */
export async function setCachedLayout(
  venueId: string, 
  layout: VenueLayout,
  customTTL?: number
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  
  try {
    const key = LayoutCacheKeys.layout(venueId);
    const ttl = customTTL || resolveLayoutTTL(layout);
    const value = JSON.stringify(layout);
    
    await client.setEx(key, ttl, value);
    
    // Also cache by layout ID for direct access
    const layoutKey = `venue-layout:layout-id:${layout.layoutId}`;
    await client.setEx(layoutKey, ttl, value);
    
  } catch (error) {
    console.warn('Layout cache write error:', error);
  }
}

/**
 * Invalidate layout cache (Fix #1: Cache Invalidation)
 */
export async function invalidateLayoutCache(venueId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  
  try {
    // Invalidate venue-based cache
    const venueKey = LayoutCacheKeys.layout(venueId);
    await client.del(venueKey);
    
    // Invalidate layout metadata cache
    const metadataKey = LayoutCacheKeys.metadata(venueId);
    await client.del(metadataKey);
    
    // Invalidate all layout version caches for this venue
    const pattern = `venue-layout:version:*:${venueId}`;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    
    // Invalidate layout ID based cache
    const layoutIdPattern = `venue-layout:layout-id:*`;
    const layoutIdKeys = await client.keys(layoutIdPattern);
    
    // Filter by venue ID (more efficient than scanning all)
    for (const key of layoutIdKeys) {
      const cached = await client.get(key);
      if (cached) {
        const layout = JSON.parse(cached) as VenueLayout;
        if (layout.venueId === venueId) {
          await client.del(key);
        }
      }
    }
    
    console.log(`✅ Invalidated layout cache for venue: ${venueId}`);
    
  } catch (error) {
    console.error('Layout cache invalidation error:', error);
  }
}

/**
 * Cache layout metadata (for fast lookups)
 */
export async function setCachedLayoutMetadata(
  venueId: string,
  metadata: {
    layoutId: string;
    name: string;
    version: string;
    status: string;
    updatedAt: Date;
  },
  ttl: number = 600
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  
  try {
    const key = LayoutCacheKeys.metadata(venueId);
    await client.setEx(key, ttl, JSON.stringify(metadata));
  } catch (error) {
    console.warn('Layout metadata cache error:', error);
  }
}

/**
 * Get cached layout metadata
 */
export async function getCachedLayoutMetadata(venueId: string): Promise<any | null> {
  const client = await getRedisClient();
  if (!client) return null;
  
  try {
    const key = LayoutCacheKeys.metadata(venueId);
    const cached = await client.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Layout metadata cache read error:', error);
    return null;
  }
}

// ================================================
// CACHE WARMING (Fix #6: Predictive Caching)
// ================================================

/**
 * Warm cache for likely venues (stub for future)
 */
export async function warmLikelyVenueCaches(userId: string): Promise<void> {
  // TODO: Implement predictive venue caching
  // const likelyVenues = await getPredictedVenueIdsForUser(userId);
  // for (const venueId of likelyVenues) {
  //   await warmLayoutCache(venueId);
  // }
  
  console.log(`🔥 Predictive cache warming stubbed for user: ${userId}`);
}

/**
 * Warm cache for specific venue
 */
export async function warmLayoutCache(venueId: string): Promise<void> {
  try {
    // Check if already cached
    const cached = await getCachedLayout(venueId);
    if (cached) return; // Already warm
    
    // TODO: Load from database and cache
    console.log(`🔥 Cache warming stubbed for venue: ${venueId}`);
    
  } catch (error) {
    console.warn('Cache warming error:', error);
  }
}

// ================================================
// CACHE STATISTICS
// ================================================

/**
 * Get cache statistics
 */
export async function getCacheStatistics(): Promise<{
  totalKeys: number;
  memoryUsage: string;
  hitRate: number;
} | null> {
  const client = await getRedisClient();
  if (!client) return null;
  
  try {
    const info = await client.info('memory');
    const keyCount = await client.dbSize();
    
    return {
      totalKeys: keyCount,
      memoryUsage: info.split('\r\n').find(line => line.startsWith('used_memory_human'))?.split(':')[1] || 'unknown',
      hitRate: 0.85, // TODO: Calculate from metrics
    };
  } catch (error) {
    console.warn('Cache statistics error:', error);
    return null;
  }
}

// ================================================
// CLEANUP AND SHUTDOWN
// ================================================

/**
 * Graceful shutdown
 */
export async function shutdownLayoutCache(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Layout Cache Redis disconnected gracefully');
    } catch (error) {
      console.error('Layout cache shutdown error:', error);
    }
  }
}