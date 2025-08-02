/**
 * LML v1 Foundation - Seatmap Test Endpoint
 * ==========================================
 * GET /api/v1/seatmap/test
 * Validates MongoDB read/write pipeline with mock layout
 * Created: 2025-08-02
 * Status: Foundation Validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVenueLayoutsCollection } from '../../../../../lib/db/mongodb';
import type { APIResponse } from '../../../../../lib/types/api';

// ================================================
// MOCK LAYOUT DATA
// ================================================

const mockLayout = {
  layout_id: 'test-layout-uuid',
  venue_id: 'test-venue-uuid',
  layout_version: 'v0.0.1',
  layout_status: 'draft',
  test: true, // Mark for easy cleanup later
  created_at: new Date(),
  viewport: { width: 1000, height: 600 },
  seats: [
    {
      seat_id: 'test-seat-uuid',
      section: 'Stalls',
      row: 'A',
      number: 1,
      x: 0.5,
      y: 0.1,
    },
  ],
};

// ================================================
// TEST ENDPOINT
// ================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Testing MongoDB venue_layouts pipeline...');
    
    // Connect to venue_layouts collection
    const collection = await getVenueLayoutsCollection();
    
    // Insert the mock layout
    console.log('📝 Inserting mock layout...');
    const insertResult = await collection.insertOne(mockLayout);
    
    if (!insertResult.acknowledged) {
      throw new Error('Insert operation was not acknowledged by MongoDB');
    }
    
    console.log(`✅ Layout inserted with _id: ${insertResult.insertedId}`);
    
    // Read it back using the _id
    console.log('🔍 Reading back the inserted layout...');
    const retrievedLayout = await collection.findOne({ _id: insertResult.insertedId });
    
    if (!retrievedLayout) {
      throw new Error(`Failed to retrieve layout with _id: ${insertResult.insertedId}`);
    }
    
    console.log('✅ Layout successfully retrieved');
    
    // Prepare success response
    const responseTime = Date.now() - startTime;
    
    const response: APIResponse<any> = {
      success: true,
      data: {
        operation: 'insert_and_retrieve',
        insertedId: insertResult.insertedId.toString(),
        layout: retrievedLayout,
        pipeline_test: {
          insert_acknowledged: insertResult.acknowledged,
          retrieve_successful: true,
          response_time_ms: responseTime,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    console.log(`✅ MongoDB pipeline test completed in ${responseTime}ms`);
    
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
    console.error('❌ MongoDB pipeline test failed:', error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'MONGODB_PIPELINE_FAILED',
        message: 'MongoDB read/write pipeline test failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred during pipeline test',
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