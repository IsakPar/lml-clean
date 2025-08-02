/**
 * LML v1 Foundation - Venue Layouts API
 * ======================================
 * GET /api/v1/venue-layouts - List layouts with pagination
 * POST /api/v1/venue-layouts - Create new layout
 * Created: 2025-08-02
 * Status: Phase 2 - Enterprise CRUD API
 */

import { NextRequest, NextResponse } from 'next/server';
import { venueLayoutService } from '../../../../lib/services/venue-layout-service';
import { 
  validateCreateRequest,
  VenueLayoutQuerySchema 
} from '../../../../lib/validation/venue-layout-schemas';
import type { APIResponse } from '../../../../lib/types/api';
import type { VenueLayoutListResponse, VenueLayoutResponse } from '../../../../lib/types/venue-layout';

// ================================================
// GET /api/v1/venue-layouts
// List venue layouts with pagination and filtering
// ================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('📋 GET /api/v1/venue-layouts - Listing venue layouts');
    
    // Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams = {
      venue_id: url.searchParams.get('venue_id') || undefined,
      layout_status: url.searchParams.get('layout_status') as 'draft' | 'active' | 'deprecated' || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      sort_by: url.searchParams.get('sort_by') as 'created_at' | 'updated_at' | 'layout_version' || 'updated_at',
      sort_order: url.searchParams.get('sort_order') as 'asc' | 'desc' || 'desc'
    };
    
    // Validate query parameters
    const queryValidation = VenueLayoutQuerySchema.safeParse(queryParams);
    if (!queryValidation.success) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_QUERY_PARAMETERS',
          message: 'Invalid query parameters',
          details: queryValidation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 400 });
    }
    
    // Fetch layouts from service
    const layoutList: VenueLayoutListResponse = await venueLayoutService.listVenueLayouts(queryValidation.data);
    
    const responseTime = Date.now() - startTime;
    
    const response: APIResponse<VenueLayoutListResponse> = {
      success: true,
      data: layoutList,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        response_time_ms: responseTime
      }
    };
    
    console.log(`✅ Listed ${layoutList.layouts.length} layouts in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Response-Time': `${responseTime}ms`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
    
  } catch (error) {
    console.error('❌ GET /api/v1/venue-layouts failed:', error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'VENUE_LAYOUTS_FETCH_FAILED',
        message: 'Failed to fetch venue layouts',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        response_time_ms: responseTime
      }
    };
    
    return NextResponse.json(errorResponse, {
      status: 500,
      headers: {
        'X-Response-Time': `${responseTime}ms`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// ================================================
// POST /api/v1/venue-layouts
// Create new venue layout
// ================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🏗️ POST /api/v1/venue-layouts - Creating new venue layout');
    
    // Parse request body
    const requestBody = await request.json();
    
    // Validate request data
    const validation = validateCreateRequest(requestBody);
    if (!validation.success) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_REQUEST_DATA',
          message: 'Invalid venue layout data',
          details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 400 });
    }
    
    // Create layout using service
    const layoutResponse: VenueLayoutResponse = await venueLayoutService.createVenueLayout(validation.data);
    
    const responseTime = Date.now() - startTime;
    
    const response: APIResponse<VenueLayoutResponse> = {
      success: true,
      data: layoutResponse,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        response_time_ms: responseTime
      }
    };
    
    console.log(`✅ Created layout ${layoutResponse.layout.layout_id} in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 201,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Response-Time': `${responseTime}ms`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Location': `/api/v1/venue-layouts/${layoutResponse.layout.layout_id}`
      }
    });
    
  } catch (error) {
    console.error('❌ POST /api/v1/venue-layouts failed:', error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'VENUE_LAYOUT_CREATION_FAILED',
        message: 'Failed to create venue layout',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        response_time_ms: responseTime
      }
    };
    
    return NextResponse.json(errorResponse, {
      status: 500,
      headers: {
        'X-Response-Time': `${responseTime}ms`,
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// ================================================
// OPTIONS (CORS Support)
// ================================================

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400' // 24 hours
    }
  });
}