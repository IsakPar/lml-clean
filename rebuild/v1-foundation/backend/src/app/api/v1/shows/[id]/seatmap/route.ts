/**
 * LML v1 Foundation - Show Seatmap API
 * ====================================
 * GET /api/v1/shows/:id/seatmap
 * Returns seatmap data for a specific show
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { NextRequest, NextResponse } from 'next/server';
import type { APIResponse } from '../../../../../../lib/types/api';

// TEMPORARILY DISABLED: Seatmap endpoint due to MongoDB service refactor

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return NextResponse.json({
    success: false,
    error: {
      code: 'SEATMAP_DISABLED',
      message: 'Show seatmap API temporarily disabled',
      details: 'Endpoint disabled while fixing MongoDB service compilation errors',
      timestamp: new Date().toISOString()
    }
  }, { status: 503 });
}