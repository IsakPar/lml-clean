/**
 * Audit Logger Utility
 * ====================
 * Comprehensive change tracking and audit trail management
 */

import { createHash } from 'crypto';
import type { 
  ChangeLogEntry, 
  ChangeDetails, 
  FieldChange, 
  ChangeCategory,
  AuditAction,
  AuditConfig,
} from '../types/audit';
import type { AccessContext } from '../types/permissions';

/**
 * Create a change log entry for audit trail
 */
export function createChangeLogEntry(
  action: AuditAction,
  beforeData: any,
  afterData: any,
  accessContext: AccessContext,
  options: {
    reason?: string;
    metadata?: Record<string, any>;
    automated?: boolean;
    parentChangeId?: string;
  } = {}
): ChangeLogEntry {
  const changeId = generateChangeId();
  const timestamp = new Date();
  
  const beforeHash = beforeData ? generateContentHash(beforeData) : undefined;
  const afterHash = generateContentHash(afterData);
  
  const diff = generateDetailedDiff(beforeData, afterData);
  
  return {
    changeId,
    timestamp,
    userId: accessContext.userId,
    userEmail: accessContext.userEmail,
    userRole: accessContext.role,
    action,
    beforeHash,
    afterHash,
    diff,
    reason: options.reason,
    metadata: options.metadata,
    automated: options.automated || false,
    parentChangeId: options.parentChangeId,
  };
}

/**
 * Generate detailed diff between two objects
 */
export function generateDetailedDiff(
  beforeData: any,
  afterData: any
): ChangeDetails {
  const added: FieldChange[] = [];
  const modified: FieldChange[] = [];
  const removed: FieldChange[] = [];
  
  // Handle null/undefined cases
  if (!beforeData && afterData) {
    return {
      added: [createFieldChange('*', undefined, afterData, 'added', 'Resource created')],
      modified: [],
      removed: [],
      summary: 'Resource created',
      itemsAffected: 1,
      categories: ['audit'],
    };
  }
  
  if (beforeData && !afterData) {
    return {
      added: [],
      modified: [],
      removed: [createFieldChange('*', beforeData, undefined, 'removed', 'Resource deleted')],
      summary: 'Resource deleted',
      itemsAffected: 1,
      categories: ['audit'],
    };
  }
  
  // Deep diff for object changes
  const allPaths = new Set([
    ...getObjectPaths(beforeData || {}),
    ...getObjectPaths(afterData || {}),
  ]);
  
  for (const path of Array.from(allPaths)) {
    const beforeValue = getValueByPath(beforeData, path);
    const afterValue = getValueByPath(afterData, path);
    
    if (beforeValue === undefined && afterValue !== undefined) {
      added.push(createFieldChange(path, beforeValue, afterValue, 'added'));
    } else if (beforeValue !== undefined && afterValue === undefined) {
      removed.push(createFieldChange(path, beforeValue, afterValue, 'removed'));
    } else if (!deepEqual(beforeValue, afterValue)) {
      modified.push(createFieldChange(path, beforeValue, afterValue, 'modified'));
    }
  }
  
  const totalChanges = added.length + modified.length + removed.length;
  const categories = detectChangeCategories(added, modified, removed);
  
  return {
    added,
    modified,
    removed,
    summary: generateChangeSummary(added.length, modified.length, removed.length),
    itemsAffected: totalChanges,
    categories,
  };
}

/**
 * Create a field change record
 */
function createFieldChange(
  fieldPath: string,
  beforeValue: any,
  afterValue: any,
  changeType: 'added' | 'modified' | 'removed',
  description?: string
): FieldChange {
  return {
    fieldPath,
    beforeValue,
    afterValue,
    changeType,
    description: description || generateFieldDescription(fieldPath, changeType, beforeValue, afterValue),
    sensitive: isSensitiveField(fieldPath),
  };
}

/**
 * Generate human-readable description for field changes
 */
function generateFieldDescription(
  fieldPath: string,
  changeType: 'added' | 'modified' | 'removed',
  beforeValue: any,
  afterValue: any
): string {
  const fieldName = fieldPath.split('.').pop() || fieldPath;
  
  switch (changeType) {
    case 'added':
      return `Added ${fieldName}: ${formatValue(afterValue)}`;
    case 'removed':
      return `Removed ${fieldName}: ${formatValue(beforeValue)}`;
    case 'modified':
      return `Changed ${fieldName}: ${formatValue(beforeValue)} → ${formatValue(afterValue)}`;
    default:
      return `${changeType} ${fieldName}`;
  }
}

/**
 * Format a value for display in audit logs
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value.length > 50 ? `"${value.substring(0, 47)}..."` : `"${value}"`;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }
    return 'Object';
  }
  return String(value);
}

/**
 * Get all paths in an object (dot notation)
 */
function getObjectPaths(obj: any, prefix: string = ''): string[] {
  const paths: string[] = [];
  
  if (obj === null || typeof obj !== 'object') {
    return prefix ? [prefix] : [];
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    
    if (value === null || typeof value !== 'object') {
      paths.push(currentPath);
    } else if (Array.isArray(value)) {
      // Handle arrays specially
      paths.push(currentPath);
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          paths.push(...getObjectPaths(item, `${currentPath}[${index}]`));
        }
      });
    } else {
      // Recurse into objects
      paths.push(...getObjectPaths(value, currentPath));
    }
  }
  
  return paths;
}

/**
 * Get value by dot notation path
 */
function getValueByPath(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  
  return path.split('.').reduce((current, key) => {
    // Handle array notation like seats[0]
    const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayKey, indexStr] = arrayMatch;
      const arrayValue = current?.[arrayKey];
      const index = parseInt(indexStr, 10);
      return Array.isArray(arrayValue) ? arrayValue[index] : undefined;
    }
    
    return current?.[key];
  }, obj);
}

/**
 * Deep equality check for change detection
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  
  if (!a || !b || (typeof a !== 'object' && typeof b !== 'object')) {
    return a === b;
  }
  
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) {
    return false;
  }
  
  for (const key of keysA) {
    if (!keysB.includes(key)) {
      return false;
    }
    
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Detect change categories based on field paths
 */
function detectChangeCategories(
  added: FieldChange[],
  modified: FieldChange[],
  removed: FieldChange[]
): ChangeCategory[] {
  const categories = new Set<ChangeCategory>();
  
  const allChanges = [...added, ...modified, ...removed];
  
  for (const change of allChanges) {
    const path = change.fieldPath.toLowerCase();
    
    if (path.includes('seat')) {
      categories.add('seats');
    }
    if (path.includes('section')) {
      categories.add('sections');
    }
    if (path.includes('layout') || path.includes('viewport')) {
      categories.add('layout');
    }
    if (path.includes('label') || path.includes('name')) {
      categories.add('labels');
    }
    if (path.includes('x') || path.includes('y') || path.includes('coordinate')) {
      categories.add('geometry');
    }
    if (path.includes('status') || path.includes('published')) {
      categories.add('status');
    }
    if (path.includes('permission') || path.includes('role')) {
      categories.add('permissions');
    }
    if (path.includes('deployment') || path.includes('environment')) {
      categories.add('deployment');
    }
    if (path.includes('metadata') || path.includes('created') || path.includes('updated')) {
      categories.add('metadata');
    }
  }
  
  // Default to audit if no specific category detected
  if (categories.size === 0) {
    categories.add('audit');
  }
  
  return Array.from(categories);
}

/**
 * Generate change summary text
 */
function generateChangeSummary(added: number, modified: number, removed: number): string {
  const parts: string[] = [];
  
  if (added > 0) parts.push(`${added} added`);
  if (modified > 0) parts.push(`${modified} modified`);
  if (removed > 0) parts.push(`${removed} removed`);
  
  if (parts.length === 0) return 'No changes';
  
  return parts.join(', ');
}

/**
 * Check if a field is sensitive and should be redacted
 */
function isSensitiveField(fieldPath: string): boolean {
  const sensitivePatterns = [
    'password',
    'token',
    'key',
    'secret',
    'credentials',
    'apikey',
    'auth',
  ];
  
  const lowerPath = fieldPath.toLowerCase();
  return sensitivePatterns.some(pattern => lowerPath.includes(pattern));
}

/**
 * Generate content hash for change tracking
 */
export function generateContentHash(data: any): string {
  // Normalize data for consistent hashing
  const normalized = normalizeForHashing(data);
  const jsonString = JSON.stringify(normalized);
  
  return createHash('sha256')
    .update(jsonString, 'utf8')
    .digest('hex');
}

/**
 * Normalize data for consistent hashing
 */
function normalizeForHashing(data: any): any {
  if (data === null || data === undefined) {
    return null;
  }
  
  if (typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(normalizeForHashing).sort();
  }
  
  // Remove fields that shouldn't affect content hash
  const excluded = new Set([
    'created_at',
    'updated_at',
    'createdAt',
    'updatedAt',
    'timestamp',
    'changeLog',
    'lastModified',
    '_id',
    'id', // Keep layout_id but exclude generic id
  ]);
  
  const normalized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (!excluded.has(key)) {
      normalized[key] = normalizeForHashing(value);
    }
  }
  
  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(normalized).sort();
  const sortedObject: Record<string, any> = {};
  
  for (const key of sortedKeys) {
    sortedObject[key] = normalized[key];
  }
  
  return sortedObject;
}

/**
 * Generate unique change ID
 */
function generateChangeId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `chg_${timestamp}_${random}`;
}

/**
 * Redact sensitive fields from audit logs
 */
export function redactSensitiveFields(
  changeLog: ChangeLogEntry,
  redactedFields: string[] = []
): ChangeLogEntry {
  const redacted = { ...changeLog };
  
  // Redact diff fields
  redacted.diff = {
    ...redacted.diff,
    added: redacted.diff.added.map(change => redactFieldChange(change, redactedFields)),
    modified: redacted.diff.modified.map(change => redactFieldChange(change, redactedFields)),
    removed: redacted.diff.removed.map(change => redactFieldChange(change, redactedFields)),
  };
  
  return redacted;
}

/**
 * Redact sensitive field change
 */
function redactFieldChange(change: FieldChange, redactedFields: string[]): FieldChange {
  const shouldRedact = change.sensitive || 
    redactedFields.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'), 'i');
      return regex.test(change.fieldPath);
    });
  
  if (!shouldRedact) {
    return change;
  }
  
  return {
    ...change,
    beforeValue: change.beforeValue !== undefined ? '[REDACTED]' : undefined,
    afterValue: change.afterValue !== undefined ? '[REDACTED]' : undefined,
    description: `${change.changeType} ${change.fieldPath}: [REDACTED]`,
  };
}

/**
 * Create audit configuration with sensible defaults
 */
export function createAuditConfig(overrides: Partial<AuditConfig> = {}): AuditConfig {
  return {
    enabled: true,
    auditedActions: [
      'created',
      'updated', 
      'deleted',
      'published',
      'deployed',
      'permission_changed',
    ],
    auditReads: false,
    maxEntries: 10000,
    retentionDays: 2555, // ~7 years
    compressOldEntries: true,
    enableExport: true,
    redactedFields: [
      'password',
      'token',
      'key',
      'secret',
      'credentials',
      '*.password',
      '*.secret',
    ],
    ...overrides,
  };
}

/**
 * Constants for audit logger configuration
 */
export const AUDIT_LOGGER_CONSTANTS = {
  /** Maximum diff size to store (64KB) */
  MAX_DIFF_SIZE_BYTES: 64 * 1024,
  
  /** Maximum field value length in audit logs */
  MAX_FIELD_VALUE_LENGTH: 1000,
  
  /** Change ID prefix */
  CHANGE_ID_PREFIX: 'chg_',
  
  /** Fields excluded from content hashing */
  HASH_EXCLUDED_FIELDS: [
    'created_at',
    'updated_at',
    'createdAt', 
    'updatedAt',
    'timestamp',
    'changeLog',
    'lastModified',
    '_id',
  ],
  
  /** Default sensitive field patterns */
  DEFAULT_SENSITIVE_PATTERNS: [
    'password',
    'token',
    'key',
    'secret',
    'credentials',
    'apikey',
    'auth',
  ],
} as const;