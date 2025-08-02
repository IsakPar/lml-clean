/**
 * Permission and Access Control Type Definitions
 * ==============================================
 * Types for role-based access control and permission management
 */

/**
 * User roles in the system
 */
export type UserRole = 
  | 'super_admin'
  | 'admin'
  | 'editor'
  | 'publisher'
  | 'viewer'
  | 'guest';

/**
 * Available permissions for layouts
 */
export type Permission = 
  | 'layout.create'
  | 'layout.read'
  | 'layout.update'
  | 'layout.delete'
  | 'layout.publish'
  | 'layout.unpublish'
  | 'layout.deploy'
  | 'layout.export'
  | 'layout.import'
  | 'layout.audit.read'
  | 'layout.audit.export'
  | 'layout.permissions.manage'
  | 'system.admin';

/**
 * Access context for operations
 */
export interface AccessContext {
  /** User ID performing the operation */
  userId: string;
  
  /** User email for audit trail */
  userEmail: string;
  
  /** User's current role */
  role: UserRole;
  
  /** Organization ID (for multi-tenant) */
  organizationId: string;
  
  /** Session ID for tracking */
  sessionId?: string;
  
  /** IP address for security logging */
  ipAddress?: string;
  
  /** User agent for security logging */
  userAgent?: string;
  
  /** Additional context metadata */
  metadata?: Record<string, any>;
}