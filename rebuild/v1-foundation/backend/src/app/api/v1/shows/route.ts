/**
 * LML v1 Foundation - Shows List Endpoint
 * ======================================
 * GET /api/v1/shows
 * Returns list of upcoming shows from PostgreSQL
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllShows } from '../../../../lib/services/show-service';
import { validateNumericId } from '../../../../lib/utils/validation';
import type { ShowsResponse, APIResponse } from '../../../../lib/types/api';
import { API_ERROR_CODES } from '../../../../lib/types/api';

// ================================================
// SHOWS LIST ENDPOINT
// ================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🎭 Shows list requested');
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const page = searchParams.get('page');
    const includeInactive = searchParams.get('include_inactive') === 'true';
    
    // Validate and sanitize parameters
    const options: {
      limit?: number;
      page?: number;
      includeInactive?: boolean;
    } = {
      includeInactive,
    };
    
    if (limit) {
      try {
        const parsedLimit = validateNumericId(limit);
        if (parsedLimit > 100) {
          throw new Error('Limit cannot exceed 100');
        }
        options.limit = parsedLimit;
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: {
            code: API_ERROR_CODES.INVALID_INPUT,
            message: 'Invalid limit parameter',
            details: 'Limit must be a positive integer not exceeding 100',
            timestamp: new Date().toISOString(),
          },
        }, { status: 400 });
      }
    }
    
    if (page) {
      try {
        options.page = validateNumericId(page);
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: {
            code: API_ERROR_CODES.INVALID_INPUT,
            message: 'Invalid page parameter',
            details: 'Page must be a positive integer',
            timestamp: new Date().toISOString(),
          },
        }, { status: 400 });
      }
    }
    
    // Fetch shows from database
    const showsData = await getAllShows(options);
    
    const response: APIResponse<ShowsResponse> = {
      success: true,
      data: showsData,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Shows list returned ${showsData.shows.length} shows in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'X-Response-Time': `${responseTime}ms`,
        'X-Total-Shows': showsData.total.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
    
  } catch (error) {
    console.error('❌ Error fetching shows:', error);
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: API_ERROR_CODES.DATABASE_ERROR,
        message: 'Failed to fetch shows',
        details: error instanceof Error ? error.message : 'Unknown database error',
        timestamp: new Date().toISOString(),
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    };
    
    return NextResponse.json(errorResponse, {
      status: 500,
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