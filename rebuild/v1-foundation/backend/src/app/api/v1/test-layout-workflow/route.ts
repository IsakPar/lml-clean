/**
 * LML v1 Foundation - Layout Workflow Validation Endpoint
 * ======================================================
 * Comprehensive testing endpoint for MongoDB service validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { testMongoConnection } from '../../../../lib/services/mongodb';

interface WorkflowRequest {
  action: 'fullValidation' | 'healthCheck';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    const body: WorkflowRequest = await request.json();
    const { action } = body;
    
    console.log(`Layout Workflow Test: ${action}`);
    
    if (action === 'fullValidation') {
      return await runFullValidation();
    }
    
    if (action === 'healthCheck') {
      return await runHealthCheck();
    }
    
    return NextResponse.json({
      success: false,
      error: `Unknown action: ${action}`,
      availableActions: ['fullValidation', 'healthCheck']
    }, { status: 400 });
    
  } catch (error) {
    console.error('Layout workflow error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name || 'UnknownError',
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function runHealthCheck(): Promise<NextResponse> {
  const start = Date.now();
  
  try {
    const collections = await testMongoConnection();
    
    return NextResponse.json({
      success: true,
      health: { status: 'connected', responseTime: Date.now() - start },
      stats: { collections, collectionCount: collections.length },
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function runFullValidation(): Promise<NextResponse> {
  const overallStart = Date.now();
  const phases: any[] = [];
  
  console.log('Starting MongoDB Service Validation');
  
  try {
    phases.push(await runPhase('1: MongoDB Connection', async () => {
      const collections = await testMongoConnection();
      return { connected: true, collections, collectionCount: collections.length };
    }));
    
    phases.push(await runPhase('2: Connection Stability', async () => {
      const results = [];
      for (let i = 0; i < 3; i++) {
        const collections = await testMongoConnection();
        results.push({ attempt: i + 1, collectionCount: collections.length });
      }
      return { connectionTests: results, stable: true };
    }));
    
    phases.push(await runPhase('3: Connection Performance', async () => {
      const start = Date.now();
      await testMongoConnection();
      const duration = Date.now() - start;
      return { 
        connectionTime: duration,
        performant: duration < 1000,
        benchmark: duration < 500 ? 'excellent' : duration < 1000 ? 'good' : 'slow'
      };
    }));
    
    const successCount = phases.filter(p => p.success).length;
    const overallSuccess = successCount === phases.length;
    
    return NextResponse.json({
      success: overallSuccess,
      summary: {
        totalPhases: phases.length,
        successfulPhases: successCount,
        failedPhases: phases.length - successCount,
        overallDuration: Date.now() - overallStart,
        status: overallSuccess ? 'ALL_PHASES_PASSED' : 'SOME_PHASES_FAILED'
      },
      phases,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Full validation failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      phases,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function runPhase(name: string, testFn: () => Promise<any>): Promise<any> {
  const start = Date.now();
  
  try {
    const result = await testFn();
    
    return {
      phase: name,
      success: true,
      duration: Date.now() - start,
      details: result
    };
    
  } catch (error) {
    console.error(`Phase ${name} failed:`, error);
    
    return {
      phase: name,
      success: false,
      duration: Date.now() - start,
      details: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}