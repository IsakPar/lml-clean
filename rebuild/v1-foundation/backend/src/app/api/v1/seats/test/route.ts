/**
 * LML v1 Foundation - Seat Locking Test Endpoint
 * ===============================================
 * GET /api/v1/seats/test
 * Tests Redis seat locking functionality with mock data
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Infrastructure Testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSimpleRedisService } from '../../../../../lib/services/redis-simple';
import type { APIResponse } from '../../../../../lib/types/api';
import { v4 as uuidv4 } from 'uuid';

// ================================================
// SEAT LOCKING TEST ENDPOINT
// ================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Testing Redis seat locking pipeline...');
    
    // Get simple Redis service instance
    const redisService = await getSimpleRedisService();
    
    // Generate test data
    const testShowId = uuidv4();
    const testUserId = uuidv4(); 
    const testSeatId = uuidv4();
    const testTTL = 300; // 5 minutes for testing
    
    console.log(`📝 Test data: show=${testShowId}, user=${testUserId}, seat=${testSeatId}`);

    // Test 1: Lock a seat
    console.log('🔒 Test 1: Locking seat...');
    const lockResult = await redisService.lockSeat(testSeatId, testUserId, testShowId, testTTL);
    
    if (!lockResult.success) {
      throw new Error(`Failed to lock seat: ${lockResult.error}`);
    }
    
    console.log(`✅ Seat locked successfully with ID: ${lockResult.lockId}`);

    // Test 2: Check lock status
    console.log('🔍 Test 2: Checking lock status...');
    const statusResult = await redisService.getSeatLockStatus(testSeatId, testShowId);
    
    if (!statusResult.isLocked) {
      throw new Error('Seat should be locked but status shows unlocked');
    }
    
    console.log(`✅ Lock status confirmed: TTL=${statusResult.ttl}s, User=${statusResult.userId}`);

    // Test 3: Try to lock same seat (should fail)
    console.log('❌ Test 3: Attempting duplicate lock (should fail)...');
    const duplicateLockResult = await redisService.lockSeat(testSeatId, uuidv4(), testShowId, testTTL);
    
    if (duplicateLockResult.success) {
      throw new Error('Duplicate lock should have failed but succeeded');
    }
    
    console.log(`✅ Duplicate lock correctly rejected: ${duplicateLockResult.error}`);

    // Test 4: Get all locked seats for show
    console.log('📋 Test 4: Getting all locked seats for show...');
    const showLocksResult = await redisService.getShowLockedSeats(testShowId);
    
    if (showLocksResult.totalLockedSeats !== 1) {
      throw new Error(`Expected 1 locked seat, found ${showLocksResult.totalLockedSeats}`);
    }
    
    console.log(`✅ Show locks retrieved: ${showLocksResult.totalLockedSeats} seats locked`);

    // Test 5: Release the lock
    console.log('🔓 Test 5: Releasing seat lock...');
    const releaseResult = await redisService.releaseSeat(testSeatId, testUserId, testShowId, lockResult.lockId);
    
    if (!releaseResult.success) {
      throw new Error(`Failed to release seat: ${releaseResult.error}`);
    }
    
    console.log(`✅ Seat released successfully`);

    // Test 6: Verify seat is unlocked
    console.log('🔍 Test 6: Verifying seat is unlocked...');
    const finalStatusResult = await redisService.getSeatLockStatus(testSeatId, testShowId);
    
    if (finalStatusResult.isLocked) {
      throw new Error('Seat should be unlocked but status shows locked');
    }
    
    console.log(`✅ Seat confirmed unlocked`);

    // Test 7: Redis connection stats
    console.log('📊 Test 7: Getting Redis connection stats...');
    const connectionStats = redisService.getConnectionStats();
    
    console.log(`✅ Connection stats: ${JSON.stringify(connectionStats)}`);

    const responseTime = Date.now() - startTime;
    
    const response: APIResponse<any> = {
      success: true,
      data: {
        test_results: {
          seat_lock: { success: true, lock_id: lockResult.lockId },
          status_check: { success: true, ttl: statusResult.ttl },
          duplicate_lock_prevention: { success: true, error: duplicateLockResult.error },
          show_locks_retrieval: { success: true, count: showLocksResult.totalLockedSeats },
          seat_release: { success: true },
          final_status_check: { success: true, is_locked: finalStatusResult.isLocked },
          connection_stats: connectionStats
        },
        test_data: {
          show_id: testShowId,
          user_id: testUserId,
          seat_id: testSeatId,
          ttl_seconds: testTTL
        },
        performance: {
          total_test_time_ms: responseTime,
          redis_operations: 7
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    console.log(`✅ Redis seat locking test completed successfully in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTime}ms`,
        'X-Test-Mode': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
  } catch (error) {
    console.error('❌ Redis seat locking test failed:', error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'REDIS_SEAT_LOCKING_TEST_FAILED',
        message: 'Redis seat locking test failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred during test',
        timestamp: new Date().toISOString(),
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        response_time_ms: responseTime,
      },
    };
    
    return NextResponse.json(errorResponse, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Response-Time': `${responseTime}ms`,
        'X-Test-Mode': 'true',
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