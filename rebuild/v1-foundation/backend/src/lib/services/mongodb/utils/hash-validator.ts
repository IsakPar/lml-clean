/**
 * Hash Validator Utility
 * ======================
 * High-performance SHA256 hashing with version control and consistency validation
 */

import { createHash } from 'crypto';

/**
 * Layout hash result with metadata
 */
export interface LayoutHashResult {
  /** SHA256 hash of the layout content */
  hash: string;
  
  /** Semantic version string */
  version: string;
  
  /** Computation time in milliseconds */
  computationTimeMs: number;
  
  /** Number of elements hashed */
  elementCount: number;
  
  /** Size of normalized data in bytes */
  dataSizeBytes: number;
  
  /** Hash validation result */
  isValid: boolean;
  
  /** Any warnings encountered during hashing */
  warnings: string[];
}

/**
 * Version information for layout versioning
 */
export interface LayoutVersion {
  /** Major version (breaking changes) */
  major: number;
  
  /** Minor version (feature additions) */
  minor: number;
  
  /** Patch version (bug fixes) */
  patch: number;
  
  /** Pre-release identifier */
  prerelease?: string;
  
  /** Build metadata */
  build?: string;
}

/**
 * Hash comparison result
 */
export interface HashComparisonResult {
  /** Whether hashes are identical */
  identical: boolean;
  
  /** Previous hash */
  previousHash: string;
  
  /** Current hash */
  currentHash: string;
  
  /** Previous version */
  previousVersion: string;
  
  /** Current version */
  currentVersion: string;
  
  /** Whether version changed */
  versionChanged: boolean;
  
  /** Detected changes (if any) */
  changes?: {
    added: number;
    modified: number;
    removed: number;
    categories: string[];
  };
}

/**
 * Options for hash generation
 */
export interface HashOptions {
  /** Fields to exclude from hash calculation */
  excludeFields?: string[];
  
  /** Whether to include metadata in hash */
  includeMetadata?: boolean;
  
  /** Whether to validate the result */
  validate?: boolean;
  
  /** Whether to normalize floating point numbers */
  normalizeFloats?: boolean;
  
  /** Precision for floating point normalization */
  floatPrecision?: number;
  
  /** Whether to sort arrays for consistent ordering */
  sortArrays?: boolean;
  
  /** Maximum allowed computation time in milliseconds */
  maxComputationTimeMs?: number;
}

/**
 * Generate optimized layout hash with version control
 */
export function generateLayoutHash(
  layoutData: any,
  options: HashOptions = {}
): LayoutHashResult {
  const startTime = performance.now();
  
  const defaultOptions: Required<HashOptions> = {
    excludeFields: [
      'created_at',
      'updated_at',
      'createdAt',
      'updatedAt',
      'timestamp',
      'changeLog',
      'lastModified',
      '_id',
      'hash',
      'version',
    ],
    includeMetadata: false,
    validate: true,
    normalizeFloats: true,
    floatPrecision: 6,
    sortArrays: true,
    maxComputationTimeMs: 100, // SLA requirement
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  const warnings: string[] = [];
  
  try {
    // Normalize data for consistent hashing
    const normalized = normalizeLayoutData(layoutData, finalOptions, warnings);
    
    // Convert to canonical JSON string
    const canonicalJson = createCanonicalJson(normalized);
    
    // Calculate hash
    const hash = createHash('sha256')
      .update(canonicalJson, 'utf8')
      .digest('hex');
    
    // Generate version
    const version = generateSemanticVersion(layoutData, hash);
    
    // Calculate metrics
    const endTime = performance.now();
    const computationTimeMs = endTime - startTime;
    const elementCount = countLayoutElements(normalized);
    const dataSizeBytes = Buffer.byteLength(canonicalJson, 'utf8');
    
    // Check performance SLA
    if (computationTimeMs > finalOptions.maxComputationTimeMs) {
      warnings.push(`Hash computation took ${computationTimeMs.toFixed(2)}ms, exceeding ${finalOptions.maxComputationTimeMs}ms SLA`);
    }
    
    // Validate result
    const isValid = finalOptions.validate ? validateHashResult(hash, version, computationTimeMs) : true;
    
    return {
      hash,
      version,
      computationTimeMs,
      elementCount,
      dataSizeBytes,
      isValid,
      warnings,
    };
    
  } catch (error) {
    const endTime = performance.now();
    const computationTimeMs = endTime - startTime;
    
    return {
      hash: '',
      version: '0.0.0',
      computationTimeMs,
      elementCount: 0,
      dataSizeBytes: 0,
      isValid: false,
      warnings: [`Hash generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Compare two layout hashes and detect changes
 */
export function compareLayoutHashes(
  previousData: any,
  currentData: any,
  options: HashOptions = {}
): HashComparisonResult {
  const previousResult = generateLayoutHash(previousData, options);
  const currentResult = generateLayoutHash(currentData, options);
  
  const identical = previousResult.hash === currentResult.hash;
  const versionChanged = previousResult.version !== currentResult.version;
  
  let changes: HashComparisonResult['changes'] | undefined;
  
  // Detect changes if hashes differ
  if (!identical) {
    changes = detectLayoutChanges(previousData, currentData);
  }
  
  return {
    identical,
    previousHash: previousResult.hash,
    currentHash: currentResult.hash,
    previousVersion: previousResult.version,
    currentVersion: currentResult.version,
    versionChanged,
    changes,
  };
}

/**
 * Validate hash consistency across multiple computations
 */
export function validateHashConsistency(
  layoutData: any,
  iterations: number = 5,
  options: HashOptions = {}
): {
  consistent: boolean;
  hashes: string[];
  computationTimes: number[];
  averageTimeMs: number;
  maxTimeMs: number;
} {
  const hashes: string[] = [];
  const computationTimes: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const result = generateLayoutHash(layoutData, options);
    hashes.push(result.hash);
    computationTimes.push(result.computationTimeMs);
  }
  
  // Check if all hashes are identical
  const consistent = hashes.every(hash => hash === hashes[0]);
  
  const averageTimeMs = computationTimes.reduce((sum, time) => sum + time, 0) / iterations;
  const maxTimeMs = Math.max(...computationTimes);
  
  return {
    consistent,
    hashes,
    computationTimes,
    averageTimeMs,
    maxTimeMs,
  };
}

/**
 * Normalize layout data for consistent hashing
 */
function normalizeLayoutData(
  data: any,
  options: Required<HashOptions>,
  warnings: string[]
): any {
  if (data === null || data === undefined) {
    return null;
  }
  
  if (typeof data !== 'object') {
    if (typeof data === 'number' && options.normalizeFloats) {
      return normalizeFloat(data, options.floatPrecision);
    }
    return data;
  }
  
  if (Array.isArray(data)) {
    let normalized = data.map(item => normalizeLayoutData(item, options, warnings));
    
    if (options.sortArrays) {
      // Sort arrays by a deterministic key for consistency
      normalized = sortArrayDeterministically(normalized);
    }
    
    return normalized;
  }
  
  // Handle objects
  const normalized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip excluded fields
    if (options.excludeFields.includes(key)) {
      continue;
    }
    
    // Skip metadata if not included
    if (!options.includeMetadata && isMetadataField(key)) {
      continue;
    }
    
    normalized[key] = normalizeLayoutData(value, options, warnings);
  }
  
  return normalized;
}

/**
 * Create canonical JSON string for consistent hashing
 */
function createCanonicalJson(data: any): string {
  return JSON.stringify(data, Object.keys(data).sort());
}

/**
 * Normalize floating point numbers for consistent hashing
 */
function normalizeFloat(value: number, precision: number): number {
  return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
}

/**
 * Sort array deterministically based on content
 */
function sortArrayDeterministically(array: any[]): any[] {
  return array.sort((a, b) => {
    // Convert to string for comparison
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    return aStr.localeCompare(bStr);
  });
}

/**
 * Check if field is metadata
 */
function isMetadataField(fieldName: string): boolean {
  const metadataPatterns = [
    /^created/i,
    /^updated/i,
    /^timestamp/i,
    /^last/i,
    /^modified/i,
    /^audit/i,
    /^log/i,
  ];
  
  return metadataPatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Count layout elements for metrics
 */
function countLayoutElements(data: any): number {
  if (!data || typeof data !== 'object') {
    return 1;
  }
  
  if (Array.isArray(data)) {
    return data.reduce((count, item) => count + countLayoutElements(item), 0);
  }
  
  // Count seats, sections, and other layout elements
  let count = 0;
  
  if (data.seats && Array.isArray(data.seats)) {
    count += data.seats.length;
  }
  
  if (data.sections && Array.isArray(data.sections)) {
    count += data.sections.length;
  }
  
  if (data.zones && Array.isArray(data.zones)) {
    count += data.zones.length;
  }
  
  return count || 1;
}

/**
 * Generate semantic version based on layout data and hash
 */
function generateSemanticVersion(layoutData: any, hash: string): string {
  // Extract version from data if present
  if (layoutData?.version) {
    return normalizeVersionString(layoutData.version);
  }
  
  // Generate version based on hash and layout characteristics
  const elementCount = countLayoutElements(layoutData);
  const hashSegment = hash.substring(0, 8);
  
  // Simple versioning based on layout size and hash
  const major = Math.floor(elementCount / 1000) || 1;
  const minor = Math.floor((elementCount % 1000) / 100);
  const patch = parseInt(hashSegment.substring(0, 2), 16) % 100;
  
  return `${major}.${minor}.${patch}`;
}

/**
 * Normalize version string to semantic versioning format
 */
function normalizeVersionString(version: string): string {
  // Remove 'v' prefix if present
  const cleaned = version.replace(/^v/, '');
  
  // Split into parts
  const parts = cleaned.split('.');
  
  // Ensure we have at least major.minor.patch
  while (parts.length < 3) {
    parts.push('0');
  }
  
  // Validate parts are numbers
  const [major, minor, patch] = parts.map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
  
  return `${major}.${minor}.${patch}`;
}

/**
 * Validate hash result
 */
function validateHashResult(hash: string, version: string, computationTimeMs: number): boolean {
  // Check hash format (64 character hex string)
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return false;
  }
  
  // Check version format
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return false;
  }
  
  // Check computation time is reasonable
  if (computationTimeMs < 0 || computationTimeMs > 10000) { // Max 10 seconds
    return false;
  }
  
  return true;
}

/**
 * Detect layout changes between two versions
 */
function detectLayoutChanges(previousData: any, currentData: any): {
  added: number;
  modified: number;
  removed: number;
  categories: string[];
} {
  const changes = {
    added: 0,
    modified: 0,
    removed: 0,
    categories: new Set<string>(),
  };
  
  // Compare seats
  if (previousData?.seats && currentData?.seats) {
    const seatChanges = compareArrays(previousData.seats, currentData.seats, 'seat_id');
    changes.added += seatChanges.added;
    changes.modified += seatChanges.modified;
    changes.removed += seatChanges.removed;
    if (seatChanges.added + seatChanges.modified + seatChanges.removed > 0) {
      changes.categories.add('seats');
    }
  }
  
  // Compare sections
  if (previousData?.sections && currentData?.sections) {
    const sectionChanges = compareArrays(previousData.sections, currentData.sections, 'section_id');
    changes.added += sectionChanges.added;
    changes.modified += sectionChanges.modified;
    changes.removed += sectionChanges.removed;
    if (sectionChanges.added + sectionChanges.modified + sectionChanges.removed > 0) {
      changes.categories.add('sections');
    }
  }
  
  // Compare layout properties
  const layoutProps = ['viewport', 'name', 'description', 'status'];
  for (const prop of layoutProps) {
    if (previousData?.[prop] !== currentData?.[prop]) {
      changes.modified++;
      changes.categories.add('layout');
    }
  }
  
  return {
    added: changes.added,
    modified: changes.modified,
    removed: changes.removed,
    categories: Array.from(changes.categories),
  };
}

/**
 * Compare two arrays and count changes
 */
function compareArrays(
  previousArray: any[],
  currentArray: any[],
  idField: string
): { added: number; modified: number; removed: number } {
  const previousIds = new Set(previousArray.map(item => item[idField]));
  const currentIds = new Set(currentArray.map(item => item[idField]));
  
  const added = currentArray.filter(item => !previousIds.has(item[idField])).length;
  const removed = previousArray.filter(item => !currentIds.has(item[idField])).length;
  
  // Count modified items (items with same ID but different content)
  let modified = 0;
  const commonIds = Array.from(currentIds).filter(id => previousIds.has(id));
  
  for (const id of commonIds) {
    const prevItem = previousArray.find(item => item[idField] === id);
    const currItem = currentArray.find(item => item[idField] === id);
    
    if (JSON.stringify(prevItem) !== JSON.stringify(currItem)) {
      modified++;
    }
  }
  
  return { added, modified, removed };
}

/**
 * Create optimized hash function for performance testing
 */
export function createPerformanceTestHash(elementCount: number): LayoutHashResult {
  // Generate test data with specified number of elements
  const testData = {
    layout_id: 'perf-test',
    venue_id: 'test-venue',
    seats: Array.from({ length: elementCount }, (_, i) => ({
      seat_id: `seat-${i}`,
      section: `section-${Math.floor(i / 50)}`,
      row: String.fromCharCode(65 + Math.floor(i / 50)),
      number: (i % 50) + 1,
      x: Math.random(),
      y: Math.random(),
      category: 'standard',
    })),
    sections: Array.from({ length: Math.ceil(elementCount / 50) }, (_, i) => ({
      section_id: `section-${i}`,
      name: `Section ${String.fromCharCode(65 + i)}`,
      color: '#ffffff',
    })),
  };
  
  return generateLayoutHash(testData, {
    maxComputationTimeMs: 100, // Enforce SLA
  });
}

/**
 * Constants for hash validation
 */
export const HASH_VALIDATOR_CONSTANTS = {
  /** Maximum allowed computation time in milliseconds */
  MAX_COMPUTATION_TIME_MS: 100,
  
  /** Default floating point precision */
  DEFAULT_FLOAT_PRECISION: 6,
  
  /** Default excluded fields */
  DEFAULT_EXCLUDED_FIELDS: [
    'created_at',
    'updated_at',
    'createdAt',
    'updatedAt',
    'timestamp',
    'changeLog',
    'lastModified',
    '_id',
    'hash',
    'version',
  ],
  
  /** Performance test element counts */
  PERFORMANCE_TEST_SIZES: [10, 100, 500, 1000, 2000],
  
  /** Hash algorithm */
  HASH_ALGORITHM: 'sha256',
  
  /** Version format regex */
  VERSION_FORMAT_REGEX: /^\d+\.\d+\.\d+/,
  
  /** Hash format regex */
  HASH_FORMAT_REGEX: /^[a-f0-9]{64}$/i,
  
  /** Maximum hash computation retries */
  MAX_HASH_RETRIES: 3,
  
  /** Hash consistency test iterations */
  CONSISTENCY_TEST_ITERATIONS: 5,
} as const;