import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('🧪 Simple test endpoint called');
    
    return NextResponse.json({
      success: true,
      message: 'Simple test endpoint working',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Simple test endpoint failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Simple test failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}