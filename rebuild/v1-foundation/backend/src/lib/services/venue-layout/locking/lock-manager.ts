/**
 * LML v1 Foundation - Production-Grade Lock Manager
 * ================================================
 * Enterprise circuit breaker with PostgreSQL fallback
 * Addresses all production concerns: persistence, health checks, observability
 * Created: 2025-08-05
 * Status: Phase 2C - Bulletproof Enterprise Architecture
 */

import { 
  acquireSeatLock as acquireRedis, 
  releaseSeatLock as releaseRedis,
  extendSeatLockTTL as extendRedis,
  isLockHeldByUser as isHeldRedis,
  getSeatLockStatus as getStatusRedis,
  cleanupExpiredLocks as cleanupRedis,
  getLockStatistics as getStatsRedis,
} from './seat-lock';

import {
  acquireSeatLockPostgres,
  releaseSeatLockPostgres,
  extendSeatLockTTLPostgres,
  isLockHeldByUserPostgres,
  getSeatLockStatusPostgres,
  cleanupExpiredLocksPostgres,
  getLockStatisticsPostgres,
} from './postgres-fallback';

import { 
  SeatLockRequest, 
  SeatLockResult, 
  SeatLockStatus 
} from './seat-lock';

import { 
  recordRedisOperationSuccess, 
  recordRedisOperationFailure,
  recordRedisConnectionHealth 
} from './lock-metrics';

// ================================================
// CIRCUIT BREAKER CONFIGURATION
// ================================================

interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening circuit
  recoveryTimeout: number;       // Time to wait before retry (ms)
  healthCheckInterval: number;   // Health check frequency (ms)
  halfOpenMaxCalls: number;      // Max calls in half-open state
  latencyThreshold: number;      // Max acceptable latency (ms)
}

const CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,           // Open after 5 failures
  recoveryTimeout: 30000,        // Wait 30s before retry
  healthCheckInterval: 30000,    // Health check every 30s
  halfOpenMaxCalls: 3,           // Allow 3 test calls
  latencyThreshold: 1000,        // 1s max latency
};

// ================================================
// CIRCUIT BREAKER STATE
// ================================================

enum CircuitState {
  CLOSED = 'closed',           // Normal operation (Redis)
  OPEN = 'open',               // Failure mode (PostgreSQL)
  HALF_OPEN = 'half_open',     // Testing recovery
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  halfOpenCallCount: number;
  consecutiveLatencyViolations: number;
}

// ================================================
// LOCK BACKEND TYPE
// ================================================

export enum LockBackend {
  REDIS = 'redis',
  POSTGRES = 'postgres',
}

// ================================================
// RETRY STRATEGY
// ================================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 250,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

// ================================================
// PRODUCTION-GRADE LOCK MANAGER
// ================================================

export class ProductionLockManager {
  private circuitState: CircuitBreakerState;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private persistedStateKey = 'circuit_breaker:locking:state';
  private metricsLastEmitted: number = 0;

  constructor() {
    this.circuitState = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      halfOpenCallCount: 0,
      consecutiveLatencyViolations: 0,
    };

    this.initializeCircuitBreaker();
    this.startHealthChecking();
  }

  // ================================================
  // CIRCUIT BREAKER PERSISTENCE
  // ================================================

  /**
   * Load circuit breaker state from persistence
   */
  private async loadPersistedState(): Promise<void> {
    try {
      // Try Redis-based persistence first
      const redis = require('../../../db/redis').redis;
      if (redis && redis.isReady) {
        const persistedState = await redis.get(this.persistedStateKey);
        if (persistedState) {
          const parsed = JSON.parse(persistedState);
          this.circuitState = { ...this.circuitState, ...parsed };
          console.log(`🔄 Circuit breaker state loaded: ${this.circuitState.state}`);
          return;
        }
      }
    } catch (error) {
      console.warn('Failed to load circuit state from Redis, using default');
    }

    // Fallback to file-based persistence
    try {
      const fs = require('fs');
      const stateFile = '/tmp/lml-circuit-breaker-state.json';
      
      if (fs.existsSync(stateFile)) {
        const persistedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        this.circuitState = { ...this.circuitState, ...persistedState };
        console.log(`🔄 Circuit breaker state loaded from file: ${this.circuitState.state}`);
      }
    } catch (error) {
      console.warn('Failed to load circuit state from file, using default');
    }
  }

  /**
   * Persist circuit breaker state
   */
  private async persistState(): Promise<void> {
    const stateToSave = {
      state: this.circuitState.state,
      failureCount: this.circuitState.failureCount,
      lastFailureTime: this.circuitState.lastFailureTime,
      lastSuccessTime: this.circuitState.lastSuccessTime,
    };

    // Try Redis persistence first
    try {
      const redis = require('../../../db/redis').redis;
      if (redis && redis.isReady) {
        await redis.setex(this.persistedStateKey, 300, JSON.stringify(stateToSave)); // 5 min TTL
        return;
      }
    } catch (error) {
      console.warn('Failed to persist circuit state to Redis');
    }

    // Fallback to file persistence
    try {
      const fs = require('fs');
      const stateFile = '/tmp/lml-circuit-breaker-state.json';
      fs.writeFileSync(stateFile, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to persist circuit state to file');
    }
  }

  // ================================================
  // FUNCTIONAL HEALTH CHECKS
  // ================================================

  /**
   * Functional Redis health check (not just ping)
   */
  private async performFunctionalHealthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const startTime = Date.now();
    
    try {
      // Try to lock and unlock a dummy key
      const dummyRequest: SeatLockRequest = {
        seatId: `health-check-${Date.now()}`,
        userId: 'health-check',
        sessionId: 'health-check',
        ttlMs: 5000, // 5 second TTL
      };

      const lockResult = await acquireRedis(dummyRequest);
      
      if (lockResult.success) {
        // Successfully acquired - now release it
        await releaseRedis(dummyRequest.seatId, dummyRequest.userId, dummyRequest.sessionId);
      }

      const latency = Date.now() - startTime;
      
      return {
        healthy: lockResult.success,
        latency,
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        healthy: false,
        latency,
      };
    }
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      const healthCheck = await this.performFunctionalHealthCheck();
      
      recordRedisConnectionHealth(healthCheck.healthy, healthCheck.latency);
      
      // Track latency violations
      if (healthCheck.latency > CIRCUIT_BREAKER_CONFIG.latencyThreshold) {
        this.circuitState.consecutiveLatencyViolations++;
      } else {
        this.circuitState.consecutiveLatencyViolations = 0;
      }

      // Open circuit if too many latency violations
      if (this.circuitState.consecutiveLatencyViolations >= 3 && 
          this.circuitState.state === CircuitState.CLOSED) {
        console.warn(`🚨 Opening circuit due to high latency: ${healthCheck.latency}ms`);
        await this.openCircuit();
      }

      // Attempt recovery if circuit is open and enough time has passed
      if (this.circuitState.state === CircuitState.OPEN && 
          healthCheck.healthy &&
          Date.now() - this.circuitState.lastFailureTime > CIRCUIT_BREAKER_CONFIG.recoveryTimeout) {
        console.log('🔄 Attempting circuit recovery...');
        await this.transitionToHalfOpen();
      }

      // Emit metrics periodically
      this.emitMetrics();

    }, CIRCUIT_BREAKER_CONFIG.healthCheckInterval);
  }

  // ================================================
  // CIRCUIT STATE MANAGEMENT
  // ================================================

  private async openCircuit(): Promise<void> {
    this.circuitState.state = CircuitState.OPEN;
    this.circuitState.lastFailureTime = Date.now();
    await this.persistState();
    
    console.log('🔴 Circuit breaker OPENED - switching to PostgreSQL fallback');
    this.logModeSwitch(LockBackend.POSTGRES);
  }

  private async transitionToHalfOpen(): Promise<void> {
    this.circuitState.state = CircuitState.HALF_OPEN;
    this.circuitState.halfOpenCallCount = 0;
    await this.persistState();
    
    console.log('🟡 Circuit breaker HALF-OPEN - testing Redis recovery');
  }

  private async closeCircuit(): Promise<void> {
    this.circuitState.state = CircuitState.CLOSED;
    this.circuitState.failureCount = 0;
    this.circuitState.consecutiveLatencyViolations = 0;
    this.circuitState.lastSuccessTime = Date.now();
    await this.persistState();
    
    console.log('🟢 Circuit breaker CLOSED - Redis fully recovered');
    this.logModeSwitch(LockBackend.REDIS);
  }

  private recordSuccess(): void {
    this.circuitState.lastSuccessTime = Date.now();
    this.circuitState.consecutiveLatencyViolations = 0;

    if (this.circuitState.state === CircuitState.HALF_OPEN) {
      this.circuitState.halfOpenCallCount++;
      
      if (this.circuitState.halfOpenCallCount >= CIRCUIT_BREAKER_CONFIG.halfOpenMaxCalls) {
        this.closeCircuit();
      }
    }
  }

  private async recordFailure(): Promise<void> {
    this.circuitState.failureCount++;
    this.circuitState.lastFailureTime = Date.now();

    if (this.circuitState.state === CircuitState.CLOSED && 
        this.circuitState.failureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      await this.openCircuit();
    } else if (this.circuitState.state === CircuitState.HALF_OPEN) {
      await this.openCircuit();
    }

    await this.persistState();
  }

  // ================================================
  // RETRY STRATEGY
  // ================================================

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 0) {
          console.log(`✅ ${context} succeeded on attempt ${attempt + 1}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === RETRY_CONFIG.maxRetries) {
          break; // Don't wait after final attempt
        }
        
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        
        console.warn(`⚠️ ${context} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error(`${context} failed after ${RETRY_CONFIG.maxRetries + 1} attempts`);
  }

  // ================================================
  // OBSERVABILITY & METRICS
  // ================================================

  private logModeSwitch(newMode: LockBackend): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'lock_mode_switch',
      new_mode: newMode,
      circuit_state: this.circuitState.state,
      failure_count: this.circuitState.failureCount,
      last_failure: this.circuitState.lastFailureTime ? new Date(this.circuitState.lastFailureTime).toISOString() : null,
    };
    
    console.log('🔄 LOCK MODE SWITCH:', JSON.stringify(logEntry));
  }

  private emitMetrics(): void {
    const now = Date.now();
    
    // Emit metrics every 60 seconds
    if (now - this.metricsLastEmitted < 60000) return;
    
    const isRedisMode = this.circuitState.state === CircuitState.CLOSED || 
                       this.circuitState.state === CircuitState.HALF_OPEN;
    
    // Prometheus-style metrics
    console.log(`booking_lock_mode{mode="redis"} ${isRedisMode ? 1 : 0}`);
    console.log(`booking_lock_mode{mode="postgres"} ${isRedisMode ? 0 : 1}`);
    console.log(`booking_circuit_breaker_state{state="${this.circuitState.state}"} 1`);
    console.log(`booking_circuit_breaker_failures_total ${this.circuitState.failureCount}`);
    
    // Alert if in fallback mode for too long
    if (this.circuitState.state === CircuitState.OPEN) {
      const fallbackDuration = now - this.circuitState.lastFailureTime;
      if (fallbackDuration > 300000) { // 5 minutes
        console.log(`🚨 ALERT: Lock system in PostgreSQL fallback for ${Math.round(fallbackDuration / 1000)}s`);
      }
    }
    
    this.metricsLastEmitted = now;
  }

  // ================================================
  // PUBLIC API
  // ================================================

  public getCurrentBackend(): LockBackend {
    return this.circuitState.state === CircuitState.OPEN ? LockBackend.POSTGRES : LockBackend.REDIS;
  }

  public getCircuitState(): CircuitBreakerState {
    return { ...this.circuitState };
  }

  public async acquireSeatLock(request: SeatLockRequest): Promise<SeatLockResult> {
    return this.retryWithBackoff(async () => {
      const startTime = Date.now();
      
      try {
        let result: SeatLockResult;
        
        if (this.circuitState.state === CircuitState.OPEN) {
          // Use PostgreSQL fallback
          result = await acquireSeatLockPostgres(request);
          recordRedisOperationSuccess('postgres_acquire', Date.now() - startTime);
        } else {
          // Try Redis
          result = await acquireRedis(request);
          
          if (result.success) {
            recordRedisOperationSuccess('redis_acquire', Date.now() - startTime);
            this.recordSuccess();
          } else {
            recordRedisOperationFailure('redis_acquire', result.error || 'unknown');
            await this.recordFailure();
            
            // Immediate fallback to PostgreSQL
            result = await acquireSeatLockPostgres(request);
          }
        }
        
        return result;
        
      } catch (error) {
        recordRedisOperationFailure('lock_acquire', error instanceof Error ? error.message : 'unknown');
        await this.recordFailure();
        throw error;
      }
    }, `Lock acquisition for seat ${request.seatId}`);
  }

  public async acquireSeatLocksBatch(
    requests: SeatLockRequest[]
  ): Promise<{ success: boolean; results: SeatLockResult[] }> {
    // Bump versions in PG (monotonic) and collect <version:sessionId> values, then pipeline SET NX PX; rollback partials on any failure
    // Placeholder orchestrator; actual PG bump + Lua call wiring added in PR2
    return { success: false, results: [] };
  }

  public async releaseSeatLock(seatId: string, userId: string, sessionId: string): Promise<SeatLockResult> {
    return this.retryWithBackoff(async () => {
      const startTime = Date.now();
      
      try {
        let result: SeatLockResult;
        
        if (this.circuitState.state === CircuitState.OPEN) {
          result = await releaseSeatLockPostgres(seatId, userId, sessionId);
          recordRedisOperationSuccess('postgres_release', Date.now() - startTime);
        } else {
          result = await releaseRedis(seatId, userId, sessionId);
          
          if (result.success) {
            recordRedisOperationSuccess('redis_release', Date.now() - startTime);
            this.recordSuccess();
          } else {
            recordRedisOperationFailure('redis_release', result.error || 'unknown');
            await this.recordFailure();
            
            // Fallback to PostgreSQL
            result = await releaseSeatLockPostgres(seatId, userId, sessionId);
          }
        }
        
        return result;
        
      } catch (error) {
        recordRedisOperationFailure('lock_release', error instanceof Error ? error.message : 'unknown');
        await this.recordFailure();
        throw error;
      }
    }, `Lock release for seat ${seatId}`);
  }

  public async getSeatLockStatus(seatId: string): Promise<SeatLockStatus> {
    try {
      if (this.circuitState.state === CircuitState.OPEN) {
        return await getSeatLockStatusPostgres(seatId);
      } else {
        return await getStatusRedis(seatId);
      }
    } catch (error) {
      console.error('Lock status check failed:', error);
      // Fallback to PostgreSQL on error
      return await getSeatLockStatusPostgres(seatId);
    }
  }

  // ================================================
  // INITIALIZATION & CLEANUP
  // ================================================

  private async initializeCircuitBreaker(): Promise<void> {
    await this.loadPersistedState();
    
    console.log(`🔄 Circuit breaker initialized: ${this.circuitState.state}`);
    this.logModeSwitch(this.getCurrentBackend());
  }

  public async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    await this.persistState();
    console.log('✅ Production Lock Manager shutdown complete');
  }
}

// ================================================
// SINGLETON INSTANCE
// ================================================

export const productionLockManager = new ProductionLockManager();