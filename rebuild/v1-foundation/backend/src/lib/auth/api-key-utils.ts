/**
 * LML v1 Foundation - API Key Utilities
 * =====================================
 * API key management for service-to-service authentication (scaffolding)
 * Created: 2025-08-01
 * Status: Phase 1 Hardening (Scaffolding)
 */

import type { APIKeyData } from './types';

// ================================================
// API KEY CONFIGURATION
// ================================================

const API_KEY_CONFIG = {
  prefix: 'lml_',                    // API key prefix
  keyLength: 32,                     // Random key length
  defaultExpiry: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
  hashAlgorithm: 'sha256',
};

// ================================================
// API KEY UTILITIES (STUB IMPLEMENTATION)
// ================================================

/**
 * Generate API key (stub implementation)
 * TODO: Implement secure API key generation in Phase 3
 */
export async function generateAPIKey(
  userId: number,
  keyName: string,
  permissions: string[] = [],
  expiresInDays?: number
): Promise<{ keyId: string; apiKey: string; keyData: APIKeyData }> {
  console.log('🔑 API Key Generation (STUB):', { 
    userId, 
    keyName, 
    permissions,
    expiresInDays 
  });
  
  const keyId = generateKeyId();
  const keySecret = generateKeySecret();
  const apiKey = `${API_KEY_CONFIG.prefix}${keyId}_${keySecret}`;
  
  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + API_KEY_CONFIG.defaultExpiry);
  
  const keyData: APIKeyData = {
    keyId,
    userId,
    keyName,
    permissions,
    isActive: true,
    expiresAt,
    createdAt: new Date(),
  };
  
  // TODO: Store key data in database
  console.log('✅ Generated API key:', { keyId, keyName, expiresAt });
  
  return {
    keyId,
    apiKey,
    keyData,
  };
}

/**
 * Verify API key (stub implementation)
 * TODO: Implement API key verification with database lookup in Phase 3
 */
export async function verifyAPIKey(apiKey: string): Promise<{
  valid: boolean;
  keyData?: APIKeyData;
  error?: string;
}> {
  console.log('🔑 API Key Verification (STUB):', { 
    key: apiKey.substring(0, 15) + '...' 
  });
  
  try {
    // Validate format
    if (!apiKey.startsWith(API_KEY_CONFIG.prefix)) {
      return {
        valid: false,
        error: 'Invalid API key format',
      };
    }
    
    // Extract components
    const keyPart = apiKey.substring(API_KEY_CONFIG.prefix.length);
    const [keyId, keySecret] = keyPart.split('_');
    
    if (!keyId || !keySecret) {
      return {
        valid: false,
        error: 'Malformed API key',
      };
    }
    
    // TODO: Lookup key data in database
    // For now, create stub data based on key ID
    const stubKeyData: APIKeyData = {
      keyId,
      userId: 1,
      keyName: 'Development Key',
      permissions: ['read:shows', 'read:venues', 'write:bookings'],
      isActive: true,
      expiresAt: new Date(Date.now() + API_KEY_CONFIG.defaultExpiry),
      lastUsedAt: new Date(),
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    };
    
    // Check if key is active
    if (!stubKeyData.isActive) {
      return {
        valid: false,
        error: 'API key is inactive',
      };
    }
    
    // Check expiration
    if (stubKeyData.expiresAt && stubKeyData.expiresAt < new Date()) {
      return {
        valid: false,
        error: 'API key has expired',
      };
    }
    
    return {
      valid: true,
      keyData: stubKeyData,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'API key verification failed',
    };
  }
}

/**
 * Extract API key from request headers
 */
export function extractAPIKeyFromHeaders(headers: Headers): string | null {
  // Check X-API-Key header
  const apiKeyHeader = headers.get('X-API-Key');
  if (apiKeyHeader) {
    return apiKeyHeader;
  }
  
  // Check Authorization header with API key format
  const authHeader = headers.get('Authorization');
  if (authHeader && authHeader.startsWith('ApiKey ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * Revoke API key (stub implementation)
 * TODO: Implement key revocation in database in Phase 3
 */
export async function revokeAPIKey(keyId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log('🔑 API Key Revocation (STUB):', { keyId });
  
  try {
    // TODO: Update key status in database
    console.log(`✅ API key revoked: ${keyId}`);
    
    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Key revocation failed',
    };
  }
}

/**
 * List API keys for user (stub implementation)
 * TODO: Implement database query in Phase 3
 */
export async function listAPIKeys(userId: number): Promise<{
  keys: Omit<APIKeyData, 'lastUsedAt'>[];
  total: number;
}> {
  console.log('🔑 API Keys List (STUB):', { userId });
  
  // TODO: Fetch from database
  const stubKeys: Omit<APIKeyData, 'lastUsedAt'>[] = [
    {
      keyId: 'key_123',
      userId,
      keyName: 'Development Key',
      permissions: ['read:shows', 'read:venues'],
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ];
  
  return {
    keys: stubKeys,
    total: stubKeys.length,
  };
}

// ================================================
// PERMISSION CHECKING
// ================================================

/**
 * Check if API key has required permission
 */
export function hasAPIKeyPermission(
  keyData: APIKeyData,
  requiredPermission: string
): boolean {
  if (!keyData.isActive) {
    return false;
  }
  
  if (keyData.expiresAt && keyData.expiresAt < new Date()) {
    return false;
  }
  
  // Check for wildcard permission
  if (keyData.permissions.includes('*')) {
    return true;
  }
  
  // Check for exact permission match
  if (keyData.permissions.includes(requiredPermission)) {
    return true;
  }
  
  // Check for pattern matches (e.g., "read:*" matches "read:shows")
  const [action, resource] = requiredPermission.split(':');
  const wildcardPermission = `${action}:*`;
  
  return keyData.permissions.includes(wildcardPermission);
}

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Generate unique key ID
 */
function generateKeyId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${randomPart}`;
}

/**
 * Generate secure key secret
 */
function generateKeySecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < API_KEY_CONFIG.keyLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

/**
 * Hash API key for storage
 * TODO: Implement secure hashing in Phase 3
 */
export function hashAPIKey(apiKey: string): string {
  // Stub implementation - in production, use crypto.createHash
  return `hashed_${apiKey.substring(-10)}`;
}

/**
 * Validate API key format
 */
export function isValidAPIKeyFormat(apiKey: string): boolean {
  if (!apiKey.startsWith(API_KEY_CONFIG.prefix)) {
    return false;
  }
  
  const keyPart = apiKey.substring(API_KEY_CONFIG.prefix.length);
  const [keyId, keySecret] = keyPart.split('_');
  
  return !!(keyId && keySecret && keySecret.length >= 16);
}