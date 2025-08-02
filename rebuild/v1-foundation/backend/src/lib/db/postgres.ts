/**
 * LML v1 Foundation - PostgreSQL Connection
 * =========================================
 * Drizzle ORM connection for transactional data
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// ================================================
// CONNECTION CONFIGURATION
// ================================================

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// ================================================
// CONNECTION POOL SETUP
// ================================================

const sql = postgres(connectionString, {
  max: 5,                    // Maximum connections in pool
  idle_timeout: 20,          // Close idle connections after 20s
  connect_timeout: 10,       // Connection timeout
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  debug: process.env.ENABLE_SQL_LOGGING === 'true',
});

// ================================================
// DRIZZLE ORM INSTANCE
// ================================================

export const db = drizzle(sql, { 
  schema,
  logger: process.env.ENABLE_SQL_LOGGING === 'true'
});

// ================================================
// CONNECTION HEALTH CHECK
// ================================================

export async function checkPostgresHealth(): Promise<{
  status: 'connected' | 'error';
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Simple health check query
    await sql`SELECT 1 as health_check`;
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'connected',
      responseTime
    };
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
    
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

export async function closePostgresConnection(): Promise<void> {
  try {
    await sql.end();
    console.log('✅ PostgreSQL connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing PostgreSQL connection:', error);
  }
}

// Handle process termination
process.on('SIGTERM', closePostgresConnection);
process.on('SIGINT', closePostgresConnection);