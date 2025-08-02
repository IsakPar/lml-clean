/**
 * Publishing Guards
 * =================
 * Immutability enforcement for published layouts
 */

import { PublishingViolationError } from '../types/errors';
import type { AccessContext } from '../types/permissions';

/**
 * Layout with publishing status
 */
export interface LayoutWithStatus {
  layout_id: string;
  status: 'draft' | 'published' | 'archived';
  published?: boolean;
  published_at?: Date;
  published_by?: string;
}

/**
 * Published layout type guard
 */
export function isPublished(layout: LayoutWithStatus): layout is LayoutWithStatus & { 
  status: 'published'; 
  published: true; 
  published_at: Date; 
  published_by: string; 
} {
  return layout.status === 'published' && layout.published === true;
}

/**
 * Enforce immutability for published layouts
 */
export function enforceImmutability(
  layout: LayoutWithStatus,
  operation: 'update' | 'delete',
  context: AccessContext
): void {
  if (isPublished(layout)) {
    // Only super_admin can modify published layouts
    if (context.role !== 'super_admin') {
      throw new PublishingViolationError(
        `Cannot ${operation} published layout. Published layouts are immutable.`,
        layout.layout_id,
        'immutability_violation',
        {
          userId: context.userId,
          organizationId: context.organizationId,
          operation,
          endpoint: `layout.${operation}`,
        }
      );
    }
  }
}

/**
 * Check if layout can be published
 */
export function canPublish(
  layout: LayoutWithStatus,
  context: AccessContext
): { allowed: boolean; reason?: string } {
  // Already published
  if (isPublished(layout)) {
    return {
      allowed: false,
      reason: 'Layout is already published',
    };
  }
  
  // Must be draft status
  if (layout.status !== 'draft') {
    return {
      allowed: false,
      reason: 'Only draft layouts can be published',
    };
  }
  
  // Check permissions
  if (!['super_admin', 'admin', 'publisher'].includes(context.role)) {
    return {
      allowed: false,
      reason: 'Insufficient permissions to publish layouts',
    };
  }
  
  return { allowed: true };
}

/**
 * Check if layout can be unpublished
 */
export function canUnpublish(
  layout: LayoutWithStatus,
  context: AccessContext
): { allowed: boolean; reason?: string } {
  // Must be published
  if (!isPublished(layout)) {
    return {
      allowed: false,
      reason: 'Layout is not published',
    };
  }
  
  // Check permissions (stricter than publishing)
  if (!['super_admin', 'admin'].includes(context.role)) {
    return {
      allowed: false,
      reason: 'Insufficient permissions to unpublish layouts',
    };
  }
  
  return { allowed: true };
}