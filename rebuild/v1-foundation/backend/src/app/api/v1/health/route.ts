/**
 * LML v1 Foundation - Health Check Endpoint
 * =========================================
 * GET /api/v1/health
 * Returns system health status and database connectivity
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkPostgresHealth } from '../../../../lib/db/postgres';
import { checkMongoDBHealth } from '../../../../lib/db/mongodb';
import { checkRedisHealth } from '../../../../lib/db/redis';
import type { HealthResponse, APIResponse } from '../../../../lib/types/api';

// ================================================
// HEALTH CHECK ENDPOINT
// ================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🏥 Health check requested');
    
    // Check all database connections in parallel
    const [postgresHealth, mongoHealth, redisHealth] = await Promise.all([
      checkPostgresHealth(),
      checkMongoDBHealth(),
      checkRedisHealth(),
    ]);
    
    // Calculate overall system status
    const allConnected = 
      postgresHealth.status === 'connected' &&
      mongoHealth.status === 'connected' &&
      redisHealth.status === 'connected';
    
    const anyConnected = 
      postgresHealth.status === 'connected' ||
      mongoHealth.status === 'connected' ||
      redisHealth.status === 'connected';
    
    const systemStatus = allConnected ? 'healthy' : anyConnected ? 'degraded' : 'unhealthy';
    
    // Calculate uptime (assuming process start time)
    const uptime = Math.floor(process.uptime());
    
    const healthData: HealthResponse = {
      status: systemStatus,
      uptime,
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || 'v1',
      services: {
        postgres: postgresHealth,
        mongodb: mongoHealth,
        redis: redisHealth,
      },
    };
    
    const response: APIResponse<HealthResponse> = {
      success: true,
      data: healthData,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    // Set appropriate HTTP status based on health
    const httpStatus = systemStatus === 'healthy' ? 200 : 
                      systemStatus === 'degraded' ? 206 : 503;
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Health check completed in ${responseTime}ms - Status: ${systemStatus}`);
    
    return NextResponse.json(response, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTime}ms`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'System health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    return NextResponse.json(errorResponse, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
}

// ================================================
// OPTIONS HANDLER (CORS)
// ================================================

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}