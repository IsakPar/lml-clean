/**
 * Soft Deletion Guards
 * ===================
 * TTL enforcement and query filtering for soft deleted layouts
 */

import type { AccessContext } from '../types/permissions';

/**
 * Layout with soft deletion fields
 */
export interface LayoutWithDeletion {
  layout_id: string;
  deleted: boolean;
  deleted_at?: Date;
  deleted_by?: string;
}

/**
 * Soft deletion options
 */
export interface SoftDeleteOptions {
  /** Reason for deletion */
  reason?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
  
  /** TTL in days (overrides default) */
  ttlDays?: number;
}

/**
 * Apply soft deletion to a layout
 */
export function applySoftDelete(
  layout: LayoutWithDeletion,
  context: AccessContext,
  options: SoftDeleteOptions = {}
): LayoutWithDeletion {
  const now = new Date();
  
  return {
    ...layout,
    deleted: true,
    deleted_at: now,
    deleted_by: context.userId,
  };
}

/**
 * Filter out soft deleted layouts from query results
 */
export function filterDeleted<T extends LayoutWithDeletion>(
  layouts: T[],
  includeDeleted: boolean = false
): T[] {
  if (includeDeleted) {
    return layouts;
  }
  
  return layouts.filter(layout => !layout.deleted);
}

/**
 * Create MongoDB query filter for soft deletion
 */
export function createDeletionFilter(includeDeleted: boolean = false): Record<string, any> {
  if (includeDeleted) {
    return {};
  }
  
  return { deleted: { $ne: true } };
}

/**
 * Check if layout is soft deleted
 */
export function isDeleted(layout: LayoutWithDeletion): boolean {
  return layout.deleted === true;
}

/**
 * Check if layout can be restored
 */
export function canRestore(
  layout: LayoutWithDeletion,
  context: AccessContext
): { allowed: boolean; reason?: string } {
  if (!isDeleted(layout)) {
    return {
      allowed: false,
      reason: 'Layout is not deleted',
    };
  }
  
  // Check permissions
  if (!['super_admin', 'admin'].includes(context.role)) {
    return {
      allowed: false,
      reason: 'Insufficient permissions to restore layouts',
    };
  }
  
  return { allowed: true };
}

/**
 * Constants for soft deletion
 */
export const SOFT_DELETE_CONSTANTS = {
  /** Default TTL for soft deleted layouts (30 days) */
  DEFAULT_TTL_DAYS: 30,
  
  /** Maximum TTL for soft deleted layouts (365 days) */
  MAX_TTL_DAYS: 365,
  
  /** Minimum TTL for soft deleted layouts (1 day) */
  MIN_TTL_DAYS: 1,
} as const;