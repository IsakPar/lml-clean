/**
 * LML v1 Foundation - Venue Layouts API
 * =====================================
 * REST endpoints for venue layout management
 * Created: 2025-08-02
 * Status: Phase 2 - Enterprise CRUD API
 */

import { NextRequest, NextResponse } from 'next/server';
import type { APIResponse } from '../../../../lib/types/api';

// TEMPORARILY DISABLED: VenueLayout endpoints due to MongoDB service refactor

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    success: false,
    error: {
      code: 'VENUE_LAYOUTS_DISABLED',
      message: 'Venue layouts API temporarily disabled',
      details: 'Endpoint disabled while fixing MongoDB service compilation errors',
      timestamp: new Date().toISOString()
    }
  }, { status: 503 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    success: false,
    error: {
      code: 'VENUE_LAYOUTS_DISABLED',
      message: 'Venue layouts API temporarily disabled',
      details: 'Endpoint disabled while fixing MongoDB service compilation errors',
      timestamp: new Date().toISOString()
    }
  }, { status: 503 });
}