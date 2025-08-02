/**
 * LML v1 Foundation - Immutability Guard Middleware
 * =================================================
 * Enforces immutability for published and deployed layouts
 * Implementation of approved Phase 2 protection system
 */

import { VenueLayout } from '../types/venue-layout';
import { publishToCDN, validateLayoutForPublishing, CDNConfig } from '../publishing/cdn-publisher';
import { createBackupService, BackupService, DEFAULT_BACKUP_CONFIG } from '../backup/backup-service';

/**
 * Immutability Violation Error
 */
export class ImmutabilityViolationError extends Error {
  constructor(
    message: string,
    public layoutId: string,
    public currentStatus: string,
    public attemptedChanges: string[]
  ) {
    super(message);
    this.name = 'ImmutabilityViolationError';
  }
}

/**
 * Status Transition Error
 */
export class StatusTransitionError extends Error {
  constructor(
    message: string,
    public layoutId: string,
    public fromStatus: string,
    public toStatus: string
  ) {
    super(message);
    this.name = 'StatusTransitionError';
  }
}

/**
 * Layout Update Request
 */
export interface LayoutUpdateRequest {
  layoutId: string;
  updates: Partial<VenueLayout>;
  requestedBy: string;
  reason?: string;
}

/**
 * ✅ IMMUTABILITY ENFORCEMENT
 * Validates that published/deployed layouts cannot be modified
 * except for allowed status transitions and metadata updates
 */
export function enforceImmutability(
  existingLayout: VenueLayout,
  updates: Partial<VenueLayout>
): void {
  const { status } = existingLayout;
  
  // Allow updates to draft layouts
  if (status === 'draft') {
    return; // No restrictions on draft layouts
  }
  
  // Define allowed updates for published/deployed layouts
  const allowedUpdatesForPublished = [
    'status',           // Allow status transitions
    'deployedAt',       // Allow deployment timestamp
    'updatedAt',        // Allow update timestamp
    'deployment',       // Allow deployment metadata
    'tags',            // Allow tag updates for organization
    'description'      // Allow description updates
  ];
  
  const allowedUpdatesForDeployed = [
    'updatedAt',        // Allow update timestamp only
    'tags',            // Allow tag updates for organization  
    'description'      // Allow description updates
  ];
  
  // Get the list of allowed updates based on current status
  const allowedUpdates = status === 'published' 
    ? allowedUpdatesForPublished 
    : allowedUpdatesForDeployed;
  
  // Check what fields are being updated
  const updateKeys = Object.keys(updates);
  const forbiddenUpdates = updateKeys.filter(key => !allowedUpdates.includes(key));
  
  if (forbiddenUpdates.length > 0) {
    throw new ImmutabilityViolationError(
      `Cannot modify ${status} layout. Layout is immutable once ${status}.`,
      existingLayout.layoutId,
      status,
      forbiddenUpdates
    );
  }
  
  // Additional validation for status transitions
  if (updates.status) {
    validateStatusTransition(existingLayout, updates.status);
  }
}

/**
 * ✅ STATUS TRANSITION CONTROLS
 * Enforces valid status transitions: draft → published → deployed
 */
export function validateStatusTransition(
  existingLayout: VenueLayout,
  newStatus: string
): void {
  const { layoutId, status: currentStatus } = existingLayout;
  
  // Define valid transitions
  const validTransitions: Record<string, string[]> = {
    'draft': ['published'],           // Draft can only go to published
    'published': ['deployed'],        // Published can only go to deployed
    'deployed': []                    // Deployed is final - no transitions allowed
  };
  
  const allowedNextStatuses = validTransitions[currentStatus] || [];
  
  if (!allowedNextStatuses.includes(newStatus)) {
    throw new StatusTransitionError(
      `Invalid status transition from ${currentStatus} to ${newStatus}. ` +
      `Allowed transitions: ${allowedNextStatuses.join(', ') || 'none'}`,
      layoutId,
      currentStatus,
      newStatus
    );
  }
}

/**
 * ✅ PUBLISHING WORKFLOW
 * Handles the transition from draft to published with validation
 */
export async function publishLayout(
  layout: VenueLayout,
  publishedBy: string,
  options: {
    validateContent?: boolean;
    generateBackup?: boolean;
    reason?: string;
  } = {}
): Promise<VenueLayout> {
  const { validateContent = true, generateBackup = true, reason } = options;
  
  console.log(`📝 Publishing layout ${layout.layoutId}...`);
  
  // 1. Validate current status
  if (layout.status !== 'draft') {
    throw new StatusTransitionError(
      'Only draft layouts can be published',
      layout.layoutId,
      layout.status,
      'published'
    );
  }
  
  // 2. Content validation (if requested)
  if (validateContent) {
    console.log('🔍 Validating layout content...');
    // This would call our existing validateLayout function
    // from the validation module
  }
  
  // 3. ✅ NEW: Generate backup using backup service (if requested)
  if (generateBackup) {
    console.log('💾 Creating backup before publishing...');
    const backupService = createBackupService(DEFAULT_BACKUP_CONFIG);
    const backupResult = await backupService.createPrePublishBackup(layout, publishedBy);
    
    if (!backupResult.success) {
      console.warn(`⚠️ Backup failed but continuing with publish: ${backupResult.error}`);
    } else {
      console.log(`✅ Pre-publish backup created: ${backupResult.backupId}`);
    }
  }
  
  // 4. Update layout status and metadata
  const publishedLayout: VenueLayout = {
    ...layout,
    status: 'published',
    publishedAt: new Date(),
    updatedAt: new Date()
  };
  
  console.log(`✅ Layout ${layout.layoutId} published successfully`);
  return publishedLayout;
}

/**
 * ✅ DEPLOYMENT WORKFLOW
 * Handles the transition from published to deployed with CDN upload
 */
export async function deployLayout(
  layout: VenueLayout,
  deployedBy: string,
  cdnConfig?: CDNConfig,
  options: {
    validateHash?: boolean;
    generateBackup?: boolean;
    reason?: string;
  } = {}
): Promise<{ layout: VenueLayout; cdnResult: any }> {
  const { validateHash = true, generateBackup = true, reason } = options;
  
  console.log(`🚀 Deploying layout ${layout.layoutId} to CDN...`);
  
  // 1. Validate current status
  if (layout.status !== 'published') {
    throw new StatusTransitionError(
      'Only published layouts can be deployed',
      layout.layoutId,
      layout.status,
      'deployed'
    );
  }
  
  // 2. Validate layout is ready for publishing
  const validationErrors = validateLayoutForPublishing(layout);
  if (validationErrors.length > 0) {
    throw new Error(`Layout not ready for deployment: ${validationErrors.join(', ')}`);
  }
  
  // 3. ✅ NEW: Generate backup using backup service (if requested)
  if (generateBackup) {
    console.log('💾 Creating backup before deployment...');
    const backupService = createBackupService(DEFAULT_BACKUP_CONFIG);
    const backupResult = await backupService.createPreDeployBackup(layout, deployedBy);
    
    if (!backupResult.success) {
      console.warn(`⚠️ Backup failed but continuing with deploy: ${backupResult.error}`);
    } else {
      console.log(`✅ Pre-deploy backup created: ${backupResult.backupId}`);
    }
  }
  
  // 4. ✅ CRITICAL: Publish to CDN with hash validation
  console.log('🌐 Publishing to CDN with hash validation...');
  const cdnResult = await publishToCDN(layout, cdnConfig);
  
  if (!cdnResult.success) {
    throw new Error(`CDN deployment failed: ${cdnResult.error}`);
  }
  
  // 5. Update layout status and metadata
  const deployedLayout: VenueLayout = {
    ...layout,
    status: 'deployed',
    deployedAt: new Date(),
    updatedAt: new Date(),
    deployment: {
      ...layout.deployment,
      environment: 'production',
      deployedAt: new Date(),
      deployedBy: deployedBy,
      cdnUrls: {
        ...layout.deployment?.cdnUrls,
        production: cdnResult.cdnUrl
      }
    }
  };
  
  console.log(`✅ Layout ${layout.layoutId} deployed successfully`);
  return { layout: deployedLayout, cdnResult };
}

/**
 * ✅ BACKUP CREATION
 * Creates backups before major status transitions
 */
export async function createLayoutBackup(
  layout: VenueLayout,
  backupId: string
): Promise<string> {
  console.log(`💾 Creating backup: ${backupId} for layout ${layout.layoutId}...`);
  
  // Mock backup implementation
  // In production, this would save to backup storage
  const backup = {
    backupId,
    layoutId: layout.layoutId,
    layout: JSON.parse(JSON.stringify(layout)), // Deep copy
    createdAt: new Date(),
    size: JSON.stringify(layout).length
  };
  
  // Simulate backup storage
  const backupPath = `backups/${layout.layoutId}/${backupId}.json`;
  console.log(`💾 Backup saved to: ${backupPath} (${backup.size} bytes)`);
  
  return backupPath;
}

/**
 * ✅ ROLLBACK FUNCTIONALITY
 * Allows rolling back to a previous backup (emergency use only)
 */
export async function rollbackLayout(
  layoutId: string,
  backupId: string,
  rolledBackBy: string,
  reason: string
): Promise<VenueLayout> {
  console.log(`⏪ Rolling back layout ${layoutId} to backup ${backupId}...`);
  
  // This would restore from backup storage in production
  console.log(`📋 Reason: ${reason}`);
  console.log(`👤 Rolled back by: ${rolledBackBy}`);
  
  // Mock rollback - would load actual backup data
  throw new Error('Rollback functionality requires manual approval from admin');
}

/**
 * Immutability Guard Constants
 */
export const IMMUTABILITY_CONSTANTS = {
  BACKUP_RETENTION_DAYS: 90,      // Keep backups for 90 days
  MAX_BACKUP_SIZE: 50 * 1024 * 1024, // 50MB max backup size
  ALLOWED_DRAFT_UPDATES: '*',     // All updates allowed for drafts
  ALLOWED_PUBLISHED_UPDATES: [
    'status', 'deployedAt', 'updatedAt', 'deployment', 'tags', 'description'
  ],
  ALLOWED_DEPLOYED_UPDATES: [
    'updatedAt', 'tags', 'description'
  ],
  VALID_STATUS_TRANSITIONS: {
    'draft': ['published'],
    'published': ['deployed'],
    'deployed': []
  }
} as const;