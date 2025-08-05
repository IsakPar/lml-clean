/**
 * LML v1 Foundation - VenueLayout Service Configuration
 * ====================================================
 * Environment-based configuration for enterprise-grade layout service
 * Created: 2025-08-05
 * Status: Phase 1 - Core Architecture
 */

// ================================================
// SERVICE CONFIGURATION TYPES
// ================================================

export interface VenueLayoutServiceConfig {
  database: {
    connectionTimeout: number;
    operationTimeout: number;
    maxRetries: number;
    poolSize: number;
  };
  cache: {
    enabled: boolean;
    defaultTTL: number;
    maxSize: number;
    redis: {
      database: number; // Separate from rate limiting
      keyPrefix: string;
    };
  };
  cdn: {
    enabled: boolean;
    provider: 'cloudflare' | 'akamai' | 'aws' | 'stub';
    purgeTimeout: number;
  };
  metrics: {
    enabled: boolean;
    collectCacheMetrics: boolean;
    collectPublishMetrics: boolean;
  };
  predictive: {
    enabled: boolean;
    warmCacheOnUserLogin: boolean;
    maxPredictedVenues: number;
  };
}

// ================================================
// ENVIRONMENT-BASED CONFIGURATION
// ================================================

export function getVenueLayoutServiceConfig(): VenueLayoutServiceConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    database: {
      connectionTimeout: 5000,
      operationTimeout: 10000,
      maxRetries: 3,
      poolSize: isProduction ? 10 : 2,
    },
    cache: {
      enabled: process.env.VENUE_LAYOUT_CACHE_ENABLED === 'true' || false,
      defaultTTL: parseInt(process.env.VENUE_LAYOUT_CACHE_TTL || '600'), // 10 minutes
      maxSize: parseInt(process.env.VENUE_LAYOUT_CACHE_MAX_SIZE || '100'),
      redis: {
        database: parseInt(process.env.VENUE_LAYOUT_REDIS_DB || '2'), // DB 2 for layouts
        keyPrefix: 'venue-layout:',
      },
    },
    cdn: {
      enabled: process.env.VENUE_LAYOUT_CDN_ENABLED === 'true' || false,
      provider: (process.env.VENUE_LAYOUT_CDN_PROVIDER as any) || 'stub',
      purgeTimeout: 30000, // 30 seconds
    },
    metrics: {
      enabled: process.env.VENUE_LAYOUT_METRICS_ENABLED === 'true' || isDevelopment,
      collectCacheMetrics: true,
      collectPublishMetrics: true,
    },
    predictive: {
      enabled: process.env.VENUE_LAYOUT_PREDICTIVE_ENABLED === 'true' || false,
      warmCacheOnUserLogin: false, // Future feature
      maxPredictedVenues: 5,
    },
  };
}

// ================================================
// CONFIGURATION VALIDATION
// ================================================

export function validateServiceConfig(config: VenueLayoutServiceConfig): string[] {
  const errors: string[] = [];

  if (config.database.connectionTimeout < 1000) {
    errors.push('Database connection timeout too low (min 1000ms)');
  }

  if (config.cache.enabled && config.cache.defaultTTL < 60) {
    errors.push('Cache TTL too low (min 60 seconds)');
  }

  if (config.database.poolSize < 1) {
    errors.push('Database pool size must be at least 1');
  }

  return errors;
}

// ================================================
// EXPORT DEFAULT CONFIG
// ================================================

export const DEFAULT_VENUE_LAYOUT_CONFIG = getVenueLayoutServiceConfig();