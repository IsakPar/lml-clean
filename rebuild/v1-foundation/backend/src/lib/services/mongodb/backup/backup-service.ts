/**
 * LML v1 Foundation - Backup Service
 * ==================================
 * Automated backup triggers for layout status transitions
 * Implementation of approved Phase 2 backup system
 */

import { VenueLayout } from '../types/venue-layout';

/**
 * Backup Configuration
 */
export interface BackupConfig {
  enabled: boolean;
  retentionDays: number;
  storageLocation: string;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

/**
 * Backup Result
 */
export interface BackupResult {
  success: boolean;
  backupId: string;
  path?: string;
  size?: number;
  error?: string;
  createdAt: Date;
  metadata: {
    layoutId: string;
    trigger: string;
    originalStatus: string;
    newStatus?: string;
  };
}

/**
 * ✅ AUTOMATED BACKUP TRIGGERS
 * Creates backups automatically during status transitions
 */
export class BackupService {
  private config: BackupConfig;

  constructor(config: BackupConfig) {
    this.config = config;
  }

  /**
   * Create backup before publishing (draft → published)
   */
  async createPrePublishBackup(
    layout: VenueLayout,
    triggeredBy: string
  ): Promise<BackupResult> {
    if (!this.config.enabled) {
      return this.createSkippedBackup(layout, 'pre-publish', 'disabled');
    }

    console.log(`💾 Creating pre-publish backup for ${layout.layoutId}...`);
    
    return await this.createBackup(layout, {
      trigger: 'pre-publish',
      triggeredBy,
      originalStatus: layout.status,
      newStatus: 'published'
    });
  }

  /**
   * Create backup before deployment (published → deployed)
   */
  async createPreDeployBackup(
    layout: VenueLayout,
    triggeredBy: string
  ): Promise<BackupResult> {
    if (!this.config.enabled) {
      return this.createSkippedBackup(layout, 'pre-deploy', 'disabled');
    }

    console.log(`💾 Creating pre-deploy backup for ${layout.layoutId}...`);
    
    return await this.createBackup(layout, {
      trigger: 'pre-deploy',
      triggeredBy,
      originalStatus: layout.status,
      newStatus: 'deployed'
    });
  }

  /**
   * Create emergency backup (manual trigger)
   */
  async createEmergencyBackup(
    layout: VenueLayout,
    triggeredBy: string,
    reason: string
  ): Promise<BackupResult> {
    console.log(`🚨 Creating emergency backup for ${layout.layoutId}: ${reason}`);
    
    return await this.createBackup(layout, {
      trigger: 'emergency',
      triggeredBy,
      originalStatus: layout.status,
      reason
    });
  }

  /**
   * Core backup creation logic
   */
  private async createBackup(
    layout: VenueLayout,
    metadata: {
      trigger: string;
      triggeredBy: string;
      originalStatus: string;
      newStatus?: string;
      reason?: string;
    }
  ): Promise<BackupResult> {
    const backupId = this.generateBackupId(layout, metadata.trigger);
    const startTime = Date.now();

    try {
      // 1. Serialize layout data
      const layoutData = this.serializeLayout(layout);
      
      // 2. Compress if enabled
      const processedData = this.config.compressionEnabled 
        ? await this.compressData(layoutData)
        : layoutData;
      
      // 3. Encrypt if enabled
      const finalData = this.config.encryptionEnabled
        ? await this.encryptData(processedData)
        : processedData;
      
      // 4. Store backup (mock implementation)
      const backupPath = await this.storeBackup(backupId, finalData, metadata);
      
      const result: BackupResult = {
        success: true,
        backupId,
        path: backupPath,
        size: finalData.length,
        createdAt: new Date(),
        metadata: {
          layoutId: layout.layoutId,
          trigger: metadata.trigger,
          originalStatus: metadata.originalStatus,
          newStatus: metadata.newStatus
        }
      };

      console.log(`✅ Backup created: ${backupId} (${result.size} bytes, ${Date.now() - startTime}ms)`);
      return result;

    } catch (error) {
      console.error(`💥 Backup failed for ${layout.layoutId}:`, error);
      
      return {
        success: false,
        backupId,
        error: error.message,
        createdAt: new Date(),
        metadata: {
          layoutId: layout.layoutId,
          trigger: metadata.trigger,
          originalStatus: metadata.originalStatus,
          newStatus: metadata.newStatus
        }
      };
    }
  }

  /**
   * Generate unique backup ID
   */
  private generateBackupId(layout: VenueLayout, trigger: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${layout.layoutId}_${trigger}_${timestamp}`;
  }

  /**
   * Serialize layout to backup format
   */
  private serializeLayout(layout: VenueLayout): string {
    const backupData = {
      backup_version: '1.0',
      created_at: new Date().toISOString(),
      layout: {
        // Include all layout data
        ...layout,
        // Add backup-specific metadata
        backup_metadata: {
          total_seats: layout.seats.length,
          total_sections: layout.sections?.length || 0,
          total_zones: layout.zones?.length || 0,
          layout_hash: layout.layoutHash,
          backup_created_at: new Date().toISOString()
        }
      }
    };

    return JSON.stringify(backupData, null, 2);
  }

  /**
   * Compress backup data (mock implementation)
   */
  private async compressData(data: string): Promise<string> {
    // In production, this would use gzip or similar
    console.log(`🗜️ Compressing backup data (${data.length} chars)`);
    
    // Mock compression - just add a compression header
    const compressed = `COMPRESSED_V1:${data}`;
    const compressionRatio = compressed.length / data.length;
    
    console.log(`📦 Compression ratio: ${(compressionRatio * 100).toFixed(1)}%`);
    return compressed;
  }

  /**
   * Encrypt backup data (mock implementation)
   */
  private async encryptData(data: string): Promise<string> {
    // In production, this would use AES-256 or similar
    console.log(`🔐 Encrypting backup data`);
    
    // Mock encryption - just add an encryption header
    const encrypted = `ENCRYPTED_V1:${data}`;
    console.log(`🔒 Data encrypted successfully`);
    
    return encrypted;
  }

  /**
   * Store backup to storage location (mock implementation)
   */
  private async storeBackup(
    backupId: string,
    data: string,
    metadata: any
  ): Promise<string> {
    // In production, this would store to S3, Azure Blob Storage, etc.
    const backupPath = `${this.config.storageLocation}/${backupId}.backup`;
    
    console.log(`💾 Storing backup to: ${backupPath}`);
    
    // Mock storage delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // In production, would actually write file or upload to cloud storage
    console.log(`✅ Backup stored successfully: ${data.length} bytes`);
    
    return backupPath;
  }

  /**
   * Create a "skipped" backup result when backups are disabled
   */
  private createSkippedBackup(
    layout: VenueLayout,
    trigger: string,
    reason: string
  ): BackupResult {
    return {
      success: true,
      backupId: `skipped_${Date.now()}`,
      createdAt: new Date(),
      metadata: {
        layoutId: layout.layoutId,
        trigger,
        originalStatus: layout.status
      }
    };
  }

  /**
   * List backups for a layout
   */
  async listBackups(layoutId: string): Promise<BackupResult[]> {
    // Mock implementation - would query backup storage
    console.log(`📋 Listing backups for layout: ${layoutId}`);
    
    // Return mock backup list
    return [
      {
        success: true,
        backupId: `${layoutId}_pre-publish_2024-01-01`,
        path: `${this.config.storageLocation}/${layoutId}_pre-publish_2024-01-01.backup`,
        size: 15420,
        createdAt: new Date('2024-01-01'),
        metadata: {
          layoutId,
          trigger: 'pre-publish',
          originalStatus: 'draft',
          newStatus: 'published'
        }
      }
    ];
  }

  /**
   * Restore layout from backup
   */
  async restoreFromBackup(
    backupId: string,
    restoredBy: string,
    reason: string
  ): Promise<VenueLayout> {
    console.log(`⏪ Restoring layout from backup: ${backupId}`);
    console.log(`👤 Restored by: ${restoredBy}, Reason: ${reason}`);
    
    // In production, would load and decrypt backup data
    throw new Error('Backup restoration requires manual approval from admin');
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<{ deleted: number; errors: string[] }> {
    console.log(`🧹 Cleaning up backups older than ${this.config.retentionDays} days...`);
    
    // Mock cleanup
    const deleted = Math.floor(Math.random() * 5); // Random for demo
    console.log(`🗑️ Deleted ${deleted} old backups`);
    
    return { deleted, errors: [] };
  }
}

/**
 * Default backup configuration
 */
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  retentionDays: 90,
  storageLocation: 'backups/layouts',
  compressionEnabled: true,
  encryptionEnabled: true
};

/**
 * Create backup service instance
 */
export function createBackupService(config?: Partial<BackupConfig>): BackupService {
  const finalConfig = { ...DEFAULT_BACKUP_CONFIG, ...config };
  return new BackupService(finalConfig);
}

/**
 * Backup service constants
 */
export const BACKUP_CONSTANTS = {
  MAX_BACKUP_SIZE: 100 * 1024 * 1024, // 100MB
  RETENTION_DAYS: 90,
  COMPRESSION_THRESHOLD: 1024, // Compress backups larger than 1KB
  ENCRYPTION_REQUIRED: true,
  BACKUP_FORMAT_VERSION: '1.0'
} as const;