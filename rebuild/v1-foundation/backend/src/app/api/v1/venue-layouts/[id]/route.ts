/**
 * LML v1 Foundation - Individual Venue Layout API
 * ================================================
 * GET /api/v1/venue-layouts/{id} - Get specific layout
 * PUT /api/v1/venue-layouts/{id} - Update layout
 * DELETE /api/v1/venue-layouts/{id} - Delete layout (draft only)
 * Created: 2025-08-02
 * Status: Phase 2 - Enterprise Individual CRUD API
 */

import { NextRequest, NextResponse } from 'next/server';
import { venueLayoutService } from '../../../../../lib/services/venue-layout-service';
import { validateUpdateRequest } from '../../../../../lib/validation/venue-layout-schemas';
import type { APIResponse } from '../../../../../lib/types/api';
import type { VenueLayoutResponse } from '../../../../../lib/types/venue-layout';

// ================================================
// HELPER: VALIDATE UUID
// ================================================

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// ================================================
// GET /api/v1/venue-layouts/{id}
// Get specific venue layout by ID
// ================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const startTime = Date.now();
  const layout_id = params.id;
  
  try {
    console.log(`🔍 GET /api/v1/venue-layouts/${layout_id} - Fetching venue layout`);
    
    // Validate UUID format
    if (!isValidUUID(layout_id)) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_LAYOUT_ID',
          message: 'Invalid layout ID format',
          details: 'Layout ID must be a valid UUID',
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 400 });
    }
    
    // Fetch layout from service
    const layoutResponse: VenueLayoutResponse | null = await venueLayoutService.getVenueLayout(layout_id);
    
    if (!layoutResponse) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'LAYOUT_NOT_FOUND',
          message: 'Venue layout not found',
          details: `No layout found with ID: ${layout_id}`,
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
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
    
    console.log(`✅ Fetched layout ${layout_id} in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutes cache for layout data
        'X-Response-Time': `${responseTime}ms`,
        'ETag': `"${layoutResponse.layout.layout_hash}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match'
      }
    });
    
  } catch (error) {
    console.error(`❌ GET /api/v1/venue-layouts/${layout_id} failed:`, error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'VENUE_LAYOUT_FETCH_FAILED',
        message: 'Failed to fetch venue layout',
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
// PUT /api/v1/venue-layouts/{id}
// Update venue layout
// ================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const startTime = Date.now();
  const layout_id = params.id;
  
  try {
    console.log(`🔄 PUT /api/v1/venue-layouts/${layout_id} - Updating venue layout`);
    
    // Validate UUID format
    if (!isValidUUID(layout_id)) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_LAYOUT_ID',
          message: 'Invalid layout ID format',
          details: 'Layout ID must be a valid UUID',
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 400 });
    }
    
    // Parse request body
    const requestBody = await request.json();
    
    // Validate request data
    const validation = validateUpdateRequest(requestBody);
    if (!validation.success) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_REQUEST_DATA',
          message: 'Invalid update data',
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
    
    // Update layout using service
    const layoutResponse: VenueLayoutResponse | null = await venueLayoutService.updateVenueLayout(
      layout_id,
      validation.data
    );
    
    if (!layoutResponse) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'LAYOUT_NOT_FOUND',
          message: 'Venue layout not found',
          details: `No layout found with ID: ${layout_id}`,
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
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
    
    console.log(`✅ Updated layout ${layout_id} in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Response-Time': `${responseTime}ms`,
        'ETag': `"${layoutResponse.layout.layout_hash}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
    
  } catch (error) {
    console.error(`❌ PUT /api/v1/venue-layouts/${layout_id} failed:`, error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'VENUE_LAYOUT_UPDATE_FAILED',
        message: 'Failed to update venue layout',
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
// DELETE /api/v1/venue-layouts/{id}
// Delete venue layout (draft only)
// ================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const startTime = Date.now();
  const layout_id = params.id;
  
  try {
    console.log(`🗑️ DELETE /api/v1/venue-layouts/${layout_id} - Deleting venue layout`);
    
    // Validate UUID format
    if (!isValidUUID(layout_id)) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_LAYOUT_ID',
          message: 'Invalid layout ID format',
          details: 'Layout ID must be a valid UUID',
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 400 });
    }
    
    // Delete layout using service
    const deleted: boolean = await venueLayoutService.deleteVenueLayout(layout_id);
    
    if (!deleted) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'LAYOUT_NOT_FOUND',
          message: 'Venue layout not found',
          details: `No layout found with ID: ${layout_id}`,
          timestamp: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: 'v1'
        }
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    const responseTime = Date.now() - startTime;
    
    const response: APIResponse<{ deleted: boolean; layout_id: string }> = {
      success: true,
      data: {
        deleted: true,
        layout_id
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        response_time_ms: responseTime
      }
    };
    
    console.log(`✅ Deleted layout ${layout_id} in ${responseTime}ms`);
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Response-Time': `${responseTime}ms`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
    
  } catch (error) {
    console.error(`❌ DELETE /api/v1/venue-layouts/${layout_id} failed:`, error);
    
    const responseTime = Date.now() - startTime;
    
    const errorResponse: APIResponse = {
      success: false,
      error: {
        code: 'VENUE_LAYOUT_DELETE_FAILED',
        message: 'Failed to delete venue layout',
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
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
      'Access-Control-Max-Age': '86400' // 24 hours
    }
  });
}