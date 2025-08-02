/**
 * Audit Trail Type Definitions
 * ============================
 * Types for comprehensive change tracking and audit logging
 */

/**
 * Audit action types
 */
export type AuditAction = 
  | 'created'
  | 'updated'
  | 'deleted'
  | 'published'
  | 'unpublished'
  | 'deployed'
  | 'rolled_back'
  | 'permission_changed'
  | 'exported'
  | 'imported'
  | 'validated'
  | 'archived';

/**
 * Change categories for filtering and analysis
 */
export type ChangeCategory = 
  | 'seats'
  | 'sections'
  | 'layout'
  | 'labels'
  | 'geometry'
  | 'status'
  | 'permissions'
  | 'deployment'
  | 'metadata'
  | 'audit'
  | 'system';

/**
 * Individual field change record
 */
export interface FieldChange {
  /** Dot notation path to the field */
  fieldPath: string;
  
  /** Value before change */
  beforeValue: any;
  
  /** Value after change */
  afterValue: any;
  
  /** Type of change performed */
  changeType: 'added' | 'modified' | 'removed';
  
  /** Human-readable description */
  description: string;
  
  /** Whether this field contains sensitive data */
  sensitive: boolean;
}

/**
 * Detailed change information with categorization
 */
export interface ChangeDetails {
  /** Fields that were added */
  added: FieldChange[];
  
  /** Fields that were modified */
  modified: FieldChange[];
  
  /** Fields that were removed */
  removed: FieldChange[];
  
  /** Summary description of changes */
  summary: string;
  
  /** Total number of items affected */
  itemsAffected: number;
  
  /** Categories of changes detected */
  categories: ChangeCategory[];
}

/**
 * Complete audit log entry
 */
export interface ChangeLogEntry {
  /** Unique identifier for this change */
  changeId: string;
  
  /** When the change occurred */
  timestamp: Date;
  
  /** User who made the change */
  userId: string;
  
  /** User email for audit trail */
  userEmail: string;
  
  /** User role at time of change */
  userRole: string;
  
  /** Type of action performed */
  action: AuditAction;
  
  /** Hash of data before change */
  beforeHash?: string;
  
  /** Hash of data after change */
  afterHash: string;
  
  /** Detailed change information */
  diff: ChangeDetails;
  
  /** Optional reason for change */
  reason?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
  
  /** Whether change was automated */
  automated: boolean;
  
  /** Parent change ID for grouped operations */
  parentChangeId?: string;
}

/**
 * Audit configuration settings
 */
export interface AuditConfig {
  /** Whether audit logging is enabled */
  enabled: boolean;
  
  /** Actions that should be audited */
  auditedActions: AuditAction[];
  
  /** Whether to audit read operations */
  auditReads: boolean;
  
  /** Maximum number of audit entries to retain */
  maxEntries: number;
  
  /** Retention period in days */
  retentionDays: number;
  
  /** Whether to compress old audit entries */
  compressOldEntries: boolean;
  
  /** Whether audit export is enabled */
  enableExport: boolean;
  
  /** Field patterns to redact in audit logs */
  redactedFields: string[];
}