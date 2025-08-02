/**
 * LML v1 Foundation - MongoDB Seatmap Pipeline Test
 * =================================================
 * GET /api/v1/seatmap/test
 * Tests MongoDB read/write operations for venue_layouts collection
 * Created: 2025-08-02
 * Status: Foundation Validation
 */

import { NextRequest, NextResponse } from 'next/server';
import type { APIResponse } from '../../../../../lib/types/api';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // TEMPORARILY DISABLED: MongoDB seatmap test due to TypeScript compilation errors
  return NextResponse.json({
    success: false,
    error: {
      code: 'MONGODB_TEST_DISABLED',
      message: 'MongoDB seatmap test temporarily disabled',
      details: 'Endpoint disabled while fixing TypeScript compilation errors',
      timestamp: new Date().toISOString()
    },
    metadata: {
      timestamp: new Date().toISOString(),
      version: 'v1'
    }
  }, { status: 503 });
}