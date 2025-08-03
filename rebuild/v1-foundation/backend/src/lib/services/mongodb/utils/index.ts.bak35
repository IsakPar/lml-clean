/**
 * MongoDB Service Utils - Central Exports
 * =======================================
 * Central export point for all utility functions
 */

// Audit logger utilities
export * from './audit-logger';
export {
  createChangeLogEntry,
  generateDetailedDiff,
  generateContentHash,
  redactSensitiveFields,
  createAuditConfig,
  AUDIT_LOGGER_CONSTANTS,
} from './audit-logger';

// Error classifier utilities
export * from './error-classifier';
export {
  classifyAndLogError,
  calculateRetryDelay,
  executeWithRetry,
  logError,
  ErrorMetricsAggregator,
  ERROR_CLASSIFIER_CONSTANTS,
} from './error-classifier';

export type {
  ErrorLogEntry,
  RetryConfig,
  ErrorHandlingResult,
} from './error-classifier';

// Hash validator utilities
export * from './hash-validator';
export {
  generateLayoutHash,
  compareLayoutHashes,
  validateHashConsistency,
  createPerformanceTestHash,
  HASH_VALIDATOR_CONSTANTS,
} from './hash-validator';

export type {
  LayoutHashResult,
  LayoutVersion,
  HashComparisonResult,
  HashOptions,
} from './hash-validator';

/**
 * Combined utility functions for common operations
 */

/**
 * Create a complete audit trail entry with hash validation
 */
export function createAuditedChange(
  action: import('../types/audit').AuditAction,
  beforeData: any,
  afterData: any,
  accessContext: import('../types/permissions').AccessContext,
  options: {
    reason?: string;
    metadata?: Record<string, any>;
    automated?: boolean;
    validateHash?: boolean;
    redactSensitive?: boolean;
  } = {}
): {
  auditEntry: import('../types/audit').ChangeLogEntry;
  hashComparison: import('./hash-validator').HashComparisonResult;
  performance: {
    auditTimeMs: number;
    hashTimeMs: number;
    totalTimeMs: number;
  };
} {
  const startTime = performance.now();
  
  // Create audit entry
  const auditStart = performance.now();
  let auditEntry = createChangeLogEntry(action, beforeData, afterData, accessContext, options);
  const auditTimeMs = performance.now() - auditStart;
  
  // Redact sensitive fields if requested
  if (options.redactSensitive) {
    auditEntry = redactSensitiveFields(auditEntry);
  }
  
  // Generate hash comparison
  const hashStart = performance.now();
  const hashComparison = compareLayoutHashes(beforeData, afterData, {
    validate: options.validateHash,
  });
  const hashTimeMs = performance.now() - hashStart;
  
  const totalTimeMs = performance.now() - startTime;
  
  return {
    auditEntry,
    hashComparison,
    performance: {
      auditTimeMs,
      hashTimeMs,
      totalTimeMs,
    },
  };
}

/**
 * Execute operation with full error handling and audit logging
 */
export async function executeWithFullLogging<T>(
  operation: () => Promise<T>,
  context: import('../types/errors').ErrorContext & {
    action: import('../types/audit').AuditAction;
    accessContext: import('../types/permissions').AccessContext;
    beforeData?: any;
  }
): Promise<{
  result: T;
  auditEntry?: import('../types/audit').ChangeLogEntry;
  performance: {
    operationTimeMs: number;
    auditTimeMs: number;
    totalTimeMs: number;
  };
}> {
  const startTime = performance.now();
  let result: T;
  let auditEntry: import('../types/audit').ChangeLogEntry | undefined;
  
  try {
    // Execute operation with retry logic
    const operationStart = performance.now();
    result = await executeWithRetry(operation, context);
    const operationTimeMs = performance.now() - operationStart;
    
    // Create audit entry for successful operation
    const auditStart = performance.now();
    if (context.beforeData !== undefined) {
      auditEntry = createChangeLogEntry(
        context.action,
        context.beforeData,
        result,
        context.accessContext,
        {
          metadata: context.metadata,
        }
      );
    }
    const auditTimeMs = performance.now() - auditStart;
    
    const totalTimeMs = performance.now() - startTime;
    
    return {
      result,
      auditEntry,
      performance: {
        operationTimeMs,
        auditTimeMs,
        totalTimeMs,
      },
    };
    
  } catch (error) {
    // Log error with classification
    classifyAndLogError(error as Error, context);
    throw error;
  }
}

/**
 * Validate layout integrity with comprehensive checks
 */
export function validateLayoutIntegrity(
  layoutData: any,
  options: {
    validateHash?: boolean;
    checkPerformance?: boolean;
    validateSchema?: boolean;
    maxElements?: number;
  } = {}
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  hashResult?: import('./hash-validator').LayoutHashResult;
  performance?: {
    validationTimeMs: number;
    hashTimeMs: number;
  };
} {
  const startTime = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let hashResult: import('./hash-validator').LayoutHashResult | undefined;
  
  // Basic existence check
  if (!layoutData) {
    errors.push('Layout data is required');
    return {
      valid: false,
      errors,
      warnings,
      performance: {
        validationTimeMs: performance.now() - startTime,
        hashTimeMs: 0,
      },
    };
  }
  
  // Check for required fields
  const requiredFields = ['layout_id', 'venue_id'];
  for (const field of requiredFields) {
    if (!layoutData[field]) {
      errors.push(`Required field missing: ${field}`);
    }
  }
  
  // Check element count limits
  if (options.maxElements) {
    const elementCount = (layoutData.seats?.length || 0) + (layoutData.sections?.length || 0);
    if (elementCount > options.maxElements) {
      errors.push(`Too many elements: ${elementCount} > ${options.maxElements}`);
    }
  }
  
  // Hash validation
  let hashTimeMs = 0;
  if (options.validateHash) {
    const hashStart = performance.now();
    hashResult = generateLayoutHash(layoutData, {
      validate: true,
      maxComputationTimeMs: 100,
    });
    hashTimeMs = performance.now() - hashStart;
    
    if (!hashResult.isValid) {
      errors.push('Hash validation failed');
    }
    
    warnings.push(...hashResult.warnings);
  }
  
  // Performance check
  if (options.checkPerformance && hashResult) {
    if (hashResult.computationTimeMs > HASH_VALIDATOR_CONSTANTS.MAX_COMPUTATION_TIME_MS) {
      warnings.push(`Hash computation slow: ${hashResult.computationTimeMs}ms`);
    }
  }
  
  const validationTimeMs = performance.now() - startTime;
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    hashResult,
    performance: {
      validationTimeMs,
      hashTimeMs,
    },
  };
}

/**
 * Performance testing utility for large layouts
 */
export function runPerformanceTests(
  elementCounts: number[] = HASH_VALIDATOR_CONSTANTS.PERFORMANCE_TEST_SIZES
): {
  results: Array<{
    elementCount: number;
    hashResult: import('./hash-validator').LayoutHashResult;
    meetsPerformanceSLA: boolean;
  }>;
  summary: {
    allMeetSLA: boolean;
    averageTimeMs: number;
    maxTimeMs: number;
    slowestElementCount: number;
  };
} {
  const results = elementCounts.map(count => {
    const hashResult = createPerformanceTestHash(count);
    const meetsPerformanceSLA = hashResult.computationTimeMs <= HASH_VALIDATOR_CONSTANTS.MAX_COMPUTATION_TIME_MS;
    
    return {
      elementCount: count,
      hashResult,
      meetsPerformanceSLA,
    };
  });
  
  const allMeetSLA = results.every(r => r.meetsPerformanceSLA);
  const averageTimeMs = results.reduce((sum, r) => sum + r.hashResult.computationTimeMs, 0) / results.length;
  const maxTimeMs = Math.max(...results.map(r => r.hashResult.computationTimeMs));
  const slowestElementCount = results.find(r => r.hashResult.computationTimeMs === maxTimeMs)?.elementCount || 0;
  
  return {
    results,
    summary: {
      allMeetSLA,
      averageTimeMs,
      maxTimeMs,
      slowestElementCount,
    },
  };
}

/**
 * Constants for combined utility operations
 */
export const UTILS_CONSTANTS = {
  /** Default maximum elements for validation */
  DEFAULT_MAX_ELEMENTS: 10000,
  
  /** Performance SLA for operations */
  PERFORMANCE_SLA_MS: 100,
  
  /** Default retry configuration for utilities */
  DEFAULT_UTILS_RETRY_CONFIG: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    useJitter: true,
  },
  
  /** Sensitive field patterns for redaction */
  SENSITIVE_FIELD_PATTERNS: [
    'password',
    'token', 
    'key',
    'secret',
    'credentials',
    'auth',
    'session',
  ],
} as const;