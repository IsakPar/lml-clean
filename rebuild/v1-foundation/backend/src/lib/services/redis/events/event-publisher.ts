/**
 * LML v1 Foundation - Event Publisher
 * ===================================
 * Pure Redis event publishing (no side effects)
 * Created: 2025-08-02
 * Status: Phase 3 - Redis Refactor
 */

import type { Redis } from 'ioredis';
import { generateSeatEventsChannel } from '../utils/key-generator';
import type { SeatEvent, SeatEventType } from './event-types';
import { serializeEvent, validateSeatEvent } from './event-types';

// ================================================
// PUBLISHER INTERFACES
// ================================================

export interface PublishResult {
  success: boolean;
  channelsSent: number;
  error?: string;
  eventId?: string;
}

export interface PublishOptions {
  validateEvent?: boolean;
  includeGlobalChannel?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export interface BulkPublishResult {
  successCount: number;
  failureCount: number;
  results: Array<{
    eventId: string;
    success: boolean;
    error?: string;
  }>;
}

// ================================================
// CORE PUBLISHING FUNCTIONS
// ================================================

/**
 * Publish a single event to Redis channels (pure function)
 */
export async function publishSeatEvent(
  publisher: Redis,
  event: SeatEvent,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const {
    validateEvent = true,
    includeGlobalChannel = false,
    retryOnFailure = false,
    maxRetries = 3
  } = options;

  try {
    // Validate event if requested
    if (validateEvent) {
      const validation = validateSeatEvent(event);
      if (!validation.isValid) {
        return {
          success: false,
          channelsSent: 0,
          error: `Event validation failed: ${validation.errors.join(', ')}`,
          eventId: event.eventId
        };
      }
    }

    // Serialize event
    const eventData = serializeEvent(event);
    
    // Determine channels to publish to
    const channels = getEventChannels(event, includeGlobalChannel);
    
    // Publish to all channels
    const publishPromises = channels.map(channel => 
      publishToChannel(publisher, channel, eventData, retryOnFailure, maxRetries)
    );
    
    const results = await Promise.allSettled(publishPromises);
    
    // Count successful publishes
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value > 0
    ).length;

    // Check for any failures
    const failures = results.filter(result => result.status === 'rejected');
    
    if (failures.length > 0 && successCount === 0) {
      return {
        success: false,
        channelsSent: 0,
        error: `Failed to publish to any channel: ${failures[0]?.status === 'rejected' ? failures[0].reason : 'Unknown error'}`,
        eventId: event.eventId
      };
    }

    return {
      success: true,
      channelsSent: successCount,
      eventId: event.eventId
    };

  } catch (error) {
    return {
      success: false,
      channelsSent: 0,
      error: error instanceof Error ? error.message : 'Unknown publishing error',
      eventId: event.eventId
    };
  }
}

/**
 * Publish multiple events in batch
 */
export async function publishBulkEvents(
  publisher: Redis,
  events: SeatEvent[],
  options: PublishOptions = {}
): Promise<BulkPublishResult> {
  const results: BulkPublishResult['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  // Process events concurrently but with limited concurrency
  const concurrency = 10;
  const chunks = [];
  
  for (let i = 0; i < events.length; i += concurrency) {
    chunks.push(events.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(event => publishSeatEvent(publisher, event, options));
    const chunkResults = await Promise.all(chunkPromises);
    
    chunkResults.forEach((result, index) => {
      const event = chunk[index];
      
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
      
      results.push({
        eventId: event.eventId,
        success: result.success,
        error: result.error
      });
    });
  }

  return {
    successCount,
    failureCount,
    results
  };
}

// ================================================
// CHANNEL MANAGEMENT
// ================================================

function getEventChannels(event: SeatEvent, includeGlobal: boolean): string[] {
  const channels: string[] = [];
  
  // Add show-specific channel
  if (event.showId !== 'system') {
    channels.push(generateSeatEventsChannel(event.showId));
  }
  
  // Add event-type specific channels
  switch (event.type) {
    case 'bulk_lock':
    case 'bulk_release':
    case 'bulk_reservation':
      channels.push(`bulk_events:${event.showId}`);
      break;
      
    case 'show_opened':
    case 'show_closed':
    case 'show_suspended':
    case 'seats_released':
      channels.push(`show_events:${event.showId}`);
      break;
      
    case 'redis_reconnect':
    case 'cleanup_expired':
    case 'sync_postgres':
    case 'health_alert':
      channels.push('system_events:global');
      break;
  }
  
  // Add global channel if requested
  if (includeGlobal && event.showId !== 'system') {
    channels.push('seat_events:global');
  }
  
  return [...new Set(channels)]; // Remove duplicates
}

async function publishToChannel(
  publisher: Redis,
  channel: string,
  data: string,
  retryOnFailure: boolean,
  maxRetries: number
): Promise<number> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      const result = await publisher.publish(channel, data);
      return result; // Number of subscribers who received the message
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown publish error');
      
      if (!retryOnFailure || attempt >= maxRetries) {
        throw lastError;
      }
      
      attempt++;
      
      // Exponential backoff
      const delay = Math.min(100 * Math.pow(2, attempt), 1000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// ================================================
// PUBLISHER HEALTH & MONITORING
// ================================================

export interface PublisherHealth {
  isConnected: boolean;
  lastPublishTime?: Date;
  publishCount: number;
  errorCount: number;
  averageLatency: number;
}

export class EventPublisherMonitor {
  private publishCount = 0;
  private errorCount = 0;
  private latencies: number[] = [];
  private lastPublishTime?: Date;
  private maxLatencyHistory = 100;

  recordPublish(latencyMs: number, success: boolean): void {
    this.publishCount++;
    this.lastPublishTime = new Date();
    
    if (success) {
      this.latencies.push(latencyMs);
      
      // Keep only recent latencies for average calculation
      if (this.latencies.length > this.maxLatencyHistory) {
        this.latencies = this.latencies.slice(-this.maxLatencyHistory);
      }
    } else {
      this.errorCount++;
    }
  }

  getHealth(): PublisherHealth {
    const averageLatency = this.latencies.length > 0 
      ? this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length 
      : 0;

    return {
      isConnected: true, // This would be determined by Redis connection status
      lastPublishTime: this.lastPublishTime,
      publishCount: this.publishCount,
      errorCount: this.errorCount,
      averageLatency
    };
  }

  reset(): void {
    this.publishCount = 0;
    this.errorCount = 0;
    this.latencies = [];
    this.lastPublishTime = undefined;
  }
}

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Test if a Redis publisher is working
 */
export async function testPublisher(publisher: Redis): Promise<boolean> {
  try {
    const testChannel = 'test_channel_' + Date.now();
    const result = await publisher.publish(testChannel, 'test');
    return result >= 0; // Redis returns number of subscribers (0 is valid)
  } catch {
    return false;
  }
}

/**
 * Get active subscribers count for a channel
 */
export async function getChannelSubscribers(
  publisher: Redis,
  channel: string
): Promise<number> {
  try {
    const result = await publisher.pubsub('NUMSUB', channel);
    // Result format: [channel1, count1, channel2, count2, ...]
    return Array.isArray(result) && result.length >= 2 ? parseInt(String(result[1]), 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Get all active channels with subscribers
 */
export async function getActiveChannels(publisher: Redis): Promise<string[]> {
  try {
    const result = await publisher.pubsub('CHANNELS', 'seat_events:*');
    return Array.isArray(result) ? result.map(String) : [];
  } catch {
    return [];
  }
}