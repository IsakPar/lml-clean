/**
 * LML v1 Foundation - Environment Validation
 * ==========================================
 * Validates environment variables on application boot
 * Created: 2025-08-01
 * Status: Phase 1 Hardening
 */

import { z } from 'zod';

// ================================================
// ENVIRONMENT SCHEMA VALIDATION
// ================================================

const envSchema = z.object({
  // Core application settings
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.string().regex(/^\d+$/).default('3001'),
  
  // Database connections (required)
  DATABASE_URL: z.string().startsWith('postgresql://'),
  MONGODB_URI: z.string().startsWith('mongodb://'),
  MONGODB_DB: z.string().min(1),
  REDIS_URL: z.string().startsWith('redis://'),
  
  // Public URLs
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  
  // Stripe (optional for development)
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test_|live_)/).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().regex(/^pk_(test_|live_)/).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  
  // Authentication (required for Phase 1)
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  
  // Session and Security (optional)
  SESSION_REDIS_URL: z.string().startsWith('redis://').optional(),
  SECURITY_WEBHOOK_URL: z.string().url().optional(),
  
  // NextAuth (optional for future)
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  
  // Email (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  
  // API configuration
  API_VERSION: z.string().default('v1'),
  API_PREFIX: z.string().default('/api/v1'),
  
  // Logging and debugging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  ENABLE_SQL_LOGGING: z.enum(['true', 'false']).default('false'),
  ENABLE_API_LOGGING: z.enum(['true', 'false']).default('true'),
  
  // Rate limiting
  RATE_LIMIT_REQUESTS: z.string().regex(/^\d+$/).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).default('60000'),
  
  // Tenant-aware rate limiting
  RATE_LIMIT_TENANT_AWARE: z.enum(['true', 'false']).default('false'),
  RATE_LIMIT_AUTH_REQUESTS: z.string().regex(/^\d+$/).default('5'),
  RATE_LIMIT_AUTH_WINDOW_MS: z.string().regex(/^\d+$/).default('900000'),
  RATE_LIMIT_BOOKING_REQUESTS: z.string().regex(/^\d+$/).default('100'),
  RATE_LIMIT_BOOKING_WINDOW_MS: z.string().regex(/^\d+$/).default('60000'),
  
  // Next.js settings
  NEXT_TELEMETRY_DISABLED: z.enum(['1', '0']).default('1'),
});

// ================================================
// ENVIRONMENT PROFILES
// ================================================

export type Environment = 'development' | 'staging' | 'production';
export type EnvConfig = z.infer<typeof envSchema>;

// ================================================
// VALIDATION FUNCTION
// ================================================

let validatedEnv: EnvConfig | null = null;

export function validateEnvironment(): EnvConfig {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    console.log('🔍 Validating environment variables...');
    
    // Parse and validate environment
    validatedEnv = envSchema.parse(process.env);
    
    console.log(`✅ Environment validation passed`);
    console.log(`🌍 Environment: ${validatedEnv.NODE_ENV}`);
    console.log(`📊 API Version: ${validatedEnv.API_VERSION}`);
    console.log(`🔧 Log Level: ${validatedEnv.LOG_LEVEL}`);
    
    return validatedEnv;
  } catch (error) {
    console.error('❌ Environment validation failed:');
    
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  • ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error(error);
    }
    
    console.error('\n📚 See env.schema.json for required environment variables');
    process.exit(1);
  }
}

// ================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// ================================================

export function getConfig(): {
  env: Environment;
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
  port: number;
  database: {
    postgresUrl: string;
    mongoUri: string;
    mongoDb: string;
    redisUrl: string;
    enableSqlLogging: boolean;
  };
  api: {
    version: string;
    prefix: string;
    enableLogging: boolean;
  };
  rateLimit: {
    requests: number;
    windowMs: number;
    tenantAware: boolean;
    auth: {
      requests: number;
      windowMs: number;
    };
    booking: {
      requests: number;
      windowMs: number;
    };
  };
  logging: {
    level: string;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    sessionRedisUrl?: string;
    securityWebhookUrl?: string;
  };
} {
  const env = validateEnvironment();
  
  return {
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isStaging: env.NODE_ENV === 'staging', 
    isProduction: env.NODE_ENV === 'production',
    port: parseInt(env.PORT) || 3001,
    database: {
      postgresUrl: env.DATABASE_URL,
      mongoUri: env.MONGODB_URI,
      mongoDb: env.MONGODB_DB,
      redisUrl: env.REDIS_URL,
      enableSqlLogging: env.ENABLE_SQL_LOGGING === 'true',
    },
    api: {
      version: env.API_VERSION,
      prefix: env.API_PREFIX,
      enableLogging: env.ENABLE_API_LOGGING === 'true',
    },
    rateLimit: {
      requests: parseInt(env.RATE_LIMIT_REQUESTS),
      windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
      tenantAware: env.RATE_LIMIT_TENANT_AWARE === 'true',
      auth: {
        requests: parseInt(env.RATE_LIMIT_AUTH_REQUESTS),
        windowMs: parseInt(env.RATE_LIMIT_AUTH_WINDOW_MS),
      },
      booking: {
        requests: parseInt(env.RATE_LIMIT_BOOKING_REQUESTS),
        windowMs: parseInt(env.RATE_LIMIT_BOOKING_WINDOW_MS),
      },
    },
    logging: {
      level: env.LOG_LEVEL,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      sessionRedisUrl: env.SESSION_REDIS_URL,
      securityWebhookUrl: env.SECURITY_WEBHOOK_URL,
    },
  };
}

// ================================================
// ENVIRONMENT CHECKS
// ================================================

export function checkRequiredServices(): {
  postgres: boolean;
  mongodb: boolean;
  redis: boolean;
  stripe: boolean;
  email: boolean;
} {
  const env = validateEnvironment();
  
  return {
    postgres: !!env.DATABASE_URL,
    mongodb: !!(env.MONGODB_URI && env.MONGODB_DB),
    redis: !!env.REDIS_URL,
    stripe: !!(env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    email: !!(env.SMTP_HOST && env.SMTP_PORT && env.EMAIL_FROM),
  };
}

// ================================================
// STARTUP VALIDATION
// ================================================

export function logEnvironmentStatus(): void {
  const config = getConfig();
  // Feature flags boot line
  try {
    // Lazy import to avoid cycle
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFeatureFlags, getLockSettings, getWebhookSettings } = require('./config');
    const flags = getFeatureFlags();
    const locks = getLockSettings();
    const webhook = getWebhookSettings();
    console.log('\n🚩 Feature Flags (boot):', JSON.stringify(flags));
    console.log('🔒 Lock Settings:', JSON.stringify(locks));
    console.log('📬 Webhook Settings:', JSON.stringify(webhook));
  } catch (_) {
    // no-op
  }
  const services = checkRequiredServices();
  
  console.log('\n🔧 Environment Configuration:');
  console.log(`   Environment: ${config.env}`);
  console.log(`   API Version: ${config.api.version}`);
  console.log(`   Log Level: ${config.logging.level}`);
  
  console.log('\n📊 Service Availability:');
  console.log(`   PostgreSQL: ${services.postgres ? '✅' : '❌'}`);
  console.log(`   MongoDB: ${services.mongodb ? '✅' : '❌'}`);
  console.log(`   Redis: ${services.redis ? '✅' : '❌'}`);
  console.log(`   Stripe: ${services.stripe ? '✅' : '⚠️ Optional'}`);
  console.log(`   Email: ${services.email ? '✅' : '⚠️ Optional'}`);
  
  console.log('\n⚡ Rate Limiting:');
  console.log(`   Requests: ${config.rateLimit.requests} per ${config.rateLimit.windowMs}ms`);
  
  if (config.isDevelopment) {
    console.log('\n🚧 Development Mode - Additional logging enabled');
  }
  
  if (config.isProduction) {
    console.log('\n🚀 Production Mode - Security hardening active');
  }
}