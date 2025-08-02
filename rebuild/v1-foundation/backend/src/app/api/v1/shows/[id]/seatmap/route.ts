/**
 * LML v1 Foundation - Seatmap Endpoint
 * ===================================
 * GET /api/v1/shows/:id/seatmap
 * Returns complete seatmap with MongoDB layout + PostgreSQL pricing
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildSeatMap } from '../../../../../../lib/services/seatmap-service';
import { validateNumericId } from '../../../../../../lib/utils/validation';
import type { SeatMapResponse, APIResponse } from '../../../../../../lib/types/api';
import { API_ERROR_CODES } from '../../../../../../lib/types/api';

// ================================================
// SEATMAP ENDPOINT
// ================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Await params before accessing properties (Next.js 15 requirement)
    const resolvedParams = await params;
    const showIdParam = resolvedParams.id;
    
    console.log(`🗺️ Seatmap requested for show: ${showIdParam}`);
    
    // Validate show ID
    let showId: number;
    try {
      showId = validateNumericId(showIdParam);
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: {
          code: API_ERROR_CODES.INVALID_ID,
          message: 'Invalid show ID',
          details: 'Show ID must be a positive integer',
          timestamp: new Date().toISOString(),
        },
      }, { status: 400 });
    }
    
    // Build complete seatmap
    const seatMapData = await buildSeatMap(showId);
    
    if (!seatMapData) {
      return NextResponse.json({
        success: false,
        error: {
          code: API_ERROR_CODES.SEATMAP_NOT_FOUND,
          message: 'Seatmap not found',
          details: `No seatmap available for show ${showId}`,
          timestamp: new Date().toISOString(),
        },
      }, { status: 404 });
    }
    
    const response: APIResponse<SeatMapResponse> = {
      success: true,
      data: seatMapData,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Seatmap for show ${showId} returned in ${responseTime}ms - ${seatMapData.seatMap.metadata.totalSeats} seats`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute (seat availability changes)
        'X-Response-Time': `${responseTime}ms`,
        'X-Total-Seats': seatMapData.seatMap.metadata.totalSeats.toString(),
        'X-Available-Seats': seatMapData.seatMap.metadata.availableSeats.toString(),
        'X-Data-Source': seatMapData.metadata.dataSource,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
  } catch (error) {
    console.error(`❌ Error building seatmap for show ${params.id}:`, error);
    
    // Determine appropriate error code based on error type
    let errorCode = API_ERROR_CODES.INTERNAL_ERROR;
    let httpStatus = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        errorCode = API_ERROR_CODES.SHOW_NOT_FOUND;
        httpStatus = 404;
      } else if (error.message.includes('MongoDB')) {
        errorCode = API_ERROR_CODES.MONGODB_ERROR;
      } else if (error.message.includes('timeout')) {
        errorCode = API_ERROR_CODES.TIMEOUT;
        httpStatus = 504;
      }
    }
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: errorCode,
        message: 'Failed to build seatmap',
        details: error instanceof Error ? error.message : 'Unknown error occurred while building seatmap',
        timestamp: new Date().toISOString(),
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    return NextResponse.json(errorResponse, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache',
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