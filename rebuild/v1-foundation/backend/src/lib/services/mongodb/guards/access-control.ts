/**
 * Access Control Guards
 * ====================
 * Role-based permission validation and access control
 */

import { AccessDeniedError } from '../types/errors';
import type { AccessContext, Permission, UserRole } from '../types/permissions';

/**
 * Default role permissions matrix
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'layout.create',
    'layout.read',
    'layout.update',
    'layout.delete',
    'layout.publish',
    'layout.unpublish',
    'layout.deploy',
    'layout.export',
    'layout.import',
    'layout.audit.read',
    'layout.audit.export',
    'layout.permissions.manage',
    'system.admin',
  ],
  admin: [
    'layout.create',
    'layout.read',
    'layout.update',
    'layout.delete',
    'layout.publish',
    'layout.unpublish',
    'layout.export',
    'layout.import',
    'layout.audit.read',
    'layout.permissions.manage',
  ],
  editor: [
    'layout.create',
    'layout.read',
    'layout.update',
    'layout.export',
  ],
  publisher: [
    'layout.read',
    'layout.publish',
    'layout.unpublish',
    'layout.deploy',
    'layout.export',
  ],
  viewer: [
    'layout.read',
    'layout.export',
  ],
  guest: [
    'layout.read',
  ],
};

/**
 * Check if user has required permissions
 */
export function checkPermissions(
  context: AccessContext,
  requiredPermissions: Permission[],
  resourceId?: string
): void {
  const userPermissions = ROLE_PERMISSIONS[context.role] || [];
  const missingPermissions = requiredPermissions.filter(
    permission => !userPermissions.includes(permission)
  );
  
  if (missingPermissions.length > 0) {
    throw new AccessDeniedError(
      `Missing required permissions: ${missingPermissions.join(', ')}`,
      resourceId ? `access.${resourceId}` : 'access.general',
      missingPermissions,
      {
        userId: context.userId,
        organizationId: context.organizationId,
        metadata: {
          userRole: context.role,
          requiredPermissions,
          userPermissions,
          resourceId,
        },
      }
    );
  }
}

/**
 * Validate access to a specific layout
 */
export function validateAccess(
  context: AccessContext,
  layoutOwnerId: string,
  layoutOrganizationId: string,
  requiredPermissions: Permission[]
): void {
  // Check organization access
  if (context.organizationId !== layoutOrganizationId && context.role !== 'super_admin') {
    throw new AccessDeniedError(
      'Access denied: Layout belongs to different organization',
      'access.organization',
      ['layout.read'],
      {
        userId: context.userId,
        organizationId: context.organizationId,
        metadata: {
          layoutOrganizationId,
          userRole: context.role,
        },
      }
    );
  }
  
  // Check permissions
  checkPermissions(context, requiredPermissions);
  
  // Additional owner checks for sensitive operations
  if (requiredPermissions.includes('layout.delete') || 
      requiredPermissions.includes('layout.permissions.manage')) {
    
    // Only owner, admin, or super_admin can perform these operations
    if (context.userId !== layoutOwnerId && 
        !['admin', 'super_admin'].includes(context.role)) {
      throw new AccessDeniedError(
        'Access denied: Only layout owner or admin can perform this operation',
        'access.ownership',
        requiredPermissions,
        {
          userId: context.userId,
          organizationId: context.organizationId,
          metadata: {
            layoutOwnerId,
            userRole: context.role,
            requiredPermissions,
          },
        }
      );
    }
  }
}

/**
 * Get effective permissions for user
 */
export function getEffectivePermissions(context: AccessContext): Permission[] {
  return ROLE_PERMISSIONS[context.role] || [];
}

/**
 * Check if user can perform action on layout
 */
export function canPerformAction(
  context: AccessContext,
  action: string,
  layoutOwnerId?: string,
  layoutOrganizationId?: string
): { allowed: boolean; reason?: string } {
  // Map actions to permissions
  const actionPermissionMap: Record<string, Permission[]> = {
    'create': ['layout.create'],
    'read': ['layout.read'],
    'update': ['layout.update'],
    'delete': ['layout.delete'],
    'publish': ['layout.publish'],
    'unpublish': ['layout.unpublish'],
    'deploy': ['layout.deploy'],
    'export': ['layout.export'],
    'import': ['layout.import'],
    'audit': ['layout.audit.read'],
  };
  
  const requiredPermissions = actionPermissionMap[action];
  if (!requiredPermissions) {
    return {
      allowed: false,
      reason: `Unknown action: ${action}`,
    };
  }
  
  try {
    if (layoutOwnerId && layoutOrganizationId) {
      validateAccess(context, layoutOwnerId, layoutOrganizationId, requiredPermissions);
    } else {
      checkPermissions(context, requiredPermissions);
    }
    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : 'Access denied',
    };
  }
}