/**
 * LML v1 Foundation - Application Configuration
 * ============================================
 * Profile-specific configurations for different environments
 * Created: 2025-08-01
 * Status: Phase 1 Hardening
 */

import { getConfig, type Environment } from './env';

// ================================================
// CONFIGURATION PROFILES
// ================================================

interface AppConfig {
  database: {
    postgres: {
      maxConnections: number;
      idleTimeout: number;
      connectTimeout: number;
    };
    mongodb: {
      maxPoolSize: number;
      serverSelectionTimeoutMS: number;
      socketTimeoutMS: number;
    };
    redis: {
      maxRetriesPerRequest: number;
      retryDelayOnFailover: number;
      commandTimeout: number;
    };
  };
  api: {
    cors: {
      origins: string[];
      methods: string[];
      headers: string[];
    };
    rateLimit: {
      enabled: boolean;
      requests: number;
      windowMs: number;
      skipSuccessfulRequests: boolean;
    };
    cache: {
      health: number;        // Health check cache (seconds)
      shows: number;         // Shows list cache (seconds)
      seatmaps: number;      // Seatmap cache (seconds)
    };
  };
  logging: {
    level: string;
    enableSqlLogging: boolean;
    enableApiLogging: boolean;
    enablePerformanceLogging: boolean;
  };
  security: {
    enableAuth: boolean;
    enableRateLimit: boolean;
    enableCors: boolean;
    trustedProxies: string[];
  };
}

// ================================================
// ENVIRONMENT-SPECIFIC CONFIGS
// ================================================

const developmentConfig: AppConfig = {
  database: {
    postgres: {
      maxConnections: 5,
      idleTimeout: 20,
      connectTimeout: 10,
    },
    mongodb: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
    redis: {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      commandTimeout: 5000,
    },
  },
  api: {
    cors: {
      origins: ['*'], // Allow all in development
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'x-user-email'],
    },
    rateLimit: {
      enabled: false, // Disabled in development
      requests: 1000,
      windowMs: 60000,
      skipSuccessfulRequests: false,
    },
    cache: {
      health: 0,      // No caching in development
      shows: 30,      // 30 seconds
      seatmaps: 60,   // 1 minute
    },
  },
  logging: {
    level: 'debug',
    enableSqlLogging: true,
    enableApiLogging: true,
    enablePerformanceLogging: true,
  },
  security: {
    enableAuth: false,
    enableRateLimit: false,
    enableCors: true,
    trustedProxies: [],
  },
};

const stagingConfig: AppConfig = {
  database: {
    postgres: {
      maxConnections: 10,
      idleTimeout: 30,
      connectTimeout: 15,
    },
    mongodb: {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000,
    },
    redis: {
      maxRetriesPerRequest: 5,
      retryDelayOnFailover: 200,
      commandTimeout: 10000,
    },
  },
  api: {
    cors: {
      origins: [
        'https://staging.lastminutelive.com',
        'http://localhost:3000',
        'http://localhost:3001',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'x-user-email'],
    },
    rateLimit: {
      enabled: true,
      requests: 200,
      windowMs: 60000,
      skipSuccessfulRequests: true,
    },
    cache: {
      health: 30,     // 30 seconds
      shows: 300,     // 5 minutes
      seatmaps: 120,  // 2 minutes
    },
  },
  logging: {
    level: 'info',
    enableSqlLogging: false,
    enableApiLogging: true,
    enablePerformanceLogging: true,
  },
  security: {
    enableAuth: true,
    enableRateLimit: true,
    enableCors: true,
    trustedProxies: ['127.0.0.1', '::1'],
  },
};

const productionConfig: AppConfig = {
  database: {
    postgres: {
      maxConnections: 20,
      idleTimeout: 60,
      connectTimeout: 30,
    },
    mongodb: {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 120000,
    },
    redis: {
      maxRetriesPerRequest: 10,
      retryDelayOnFailover: 500,
      commandTimeout: 15000,
    },
  },
  api: {
    cors: {
      origins: [
        'https://lastminutelive.com',
        'https://www.lastminutelive.com',
        'https://app.lastminutelive.com',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'x-user-email'],
    },
    rateLimit: {
      enabled: true,
      requests: 100,
      windowMs: 60000,
      skipSuccessfulRequests: true,
    },
    cache: {
      health: 60,     // 1 minute
      shows: 600,     // 10 minutes
      seatmaps: 300,  // 5 minutes
    },
  },
  logging: {
    level: 'warn',
    enableSqlLogging: false,
    enableApiLogging: false, // Only errors in production
    enablePerformanceLogging: false,
  },
  security: {
    enableAuth: true,
    enableRateLimit: true,
    enableCors: true,
    trustedProxies: ['127.0.0.1', '::1'], // Add production proxy IPs
  },
};

// ================================================
// CONFIGURATION FACTORY
// ================================================

export function getAppConfig(): AppConfig {
  const baseConfig = getConfig();
  
  switch (baseConfig.env) {
    case 'development':
      return developmentConfig;
    case 'staging':
      return stagingConfig;
    case 'production':
      return productionConfig;
    default:
      console.warn(`⚠️ Unknown environment: ${baseConfig.env}, using development config`);
      return developmentConfig;
  }
}

// ================================================
// CONFIGURATION UTILITIES
// ================================================

export function isDevelopment(): boolean {
  return getConfig().isDevelopment;
}

export function isProduction(): boolean {
  return getConfig().isProduction;
}

export function isStaging(): boolean {
  return getConfig().isStaging;
}

export function getCacheConfig() {
  return getAppConfig().api.cache;
}

export function getCorsConfig() {
  return getAppConfig().api.cors;
}

export function getRateLimitConfig() {
  return getAppConfig().api.rateLimit;
}

export function getSecurityConfig() {
  return getAppConfig().security;
}

export function getDatabaseConfig() {
  return getAppConfig().database;
}

// ================================================
// CONFIGURATION VALIDATION
// ================================================

export function validateConfiguration(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const config = getAppConfig();
    const envConfig = getConfig();
    
    // Check database URLs
    if (!envConfig.database.postgresUrl) {
      errors.push('DATABASE_URL is required');
    }
    
    if (!envConfig.database.mongoUri) {
      errors.push('MONGODB_URI is required');
    }
    
    if (!envConfig.database.redisUrl) {
      errors.push('REDIS_URL is required');
    }
    
    // Production-specific checks
    if (isProduction()) {
      if (!process.env.STRIPE_SECRET_KEY) {
        warnings.push('STRIPE_SECRET_KEY not configured for production');
      }
      
      if (!process.env.NEXTAUTH_SECRET) {
        warnings.push('NEXTAUTH_SECRET not configured for production');
      }
      
      if (config.logging.enableSqlLogging) {
        warnings.push('SQL logging enabled in production (performance impact)');
      }
    }
    
    // Development-specific checks
    if (isDevelopment()) {
      if (!config.logging.enableApiLogging) {
        warnings.push('API logging disabled in development');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Configuration validation failed'],
      warnings: [],
    };
  }
}