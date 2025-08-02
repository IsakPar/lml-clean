/**
 * LML v1 Foundation - Show Service
 * ===============================
 * Business logic for show management
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '../db/postgres';
import { shows, type Show } from '../db/schema';
import { validateNumericId } from '../utils/validation';
import type { Show as APIShow, ShowsResponse } from '../types/api';

// ================================================
// SHOW RETRIEVAL FUNCTIONS
// ================================================

/**
 * Get all active shows
 */
export async function getAllShows(options?: {
  limit?: number;
  page?: number;
  includeInactive?: boolean;
}): Promise<ShowsResponse> {
  const { limit = 50, page = 1, includeInactive = false } = options || {};
  
  try {
    // Build query conditions
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push(eq(shows.status, 'active'));
    }
    
    // Add date filter to show only future shows
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    conditions.push(gte(shows.showDate, today));
    
    // Execute query with pagination
    const offset = (page - 1) * limit;
    
    const showsData = await db
      .select()
      .from(shows)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(shows.showDate), desc(shows.showTime))
      .limit(limit)
      .offset(offset);
    
    // Transform to API format
    const apiShows: APIShow[] = showsData.map(transformShowToAPI);
    
    return {
      shows: apiShows,
      total: apiShows.length,
      page,
      limit,
    };
  } catch (error) {
    console.error('❌ Error fetching shows:', error);
    throw new Error('Failed to fetch shows');
  }
}

/**
 * Get show by ID
 */
export async function getShowById(showId: number): Promise<APIShow | null> {
  try {
    const validatedId = validateNumericId(showId);
    
    const showData = await db
      .select()
      .from(shows)
      .where(eq(shows.id, validatedId))
      .limit(1);
    
    if (showData.length === 0) {
      return null;
    }
    
    return transformShowToAPI(showData[0]);
  } catch (error) {
    console.error(`❌ Error fetching show ${showId}:`, error);
    throw new Error(`Failed to fetch show ${showId}`);
  }
}

/**
 * Get show by slug
 */
export async function getShowBySlug(slug: string): Promise<APIShow | null> {
  try {
    const showData = await db
      .select()
      .from(shows)
      .where(eq(shows.slug, slug))
      .limit(1);
    
    if (showData.length === 0) {
      return null;
    }
    
    return transformShowToAPI(showData[0]);
  } catch (error) {
    console.error(`❌ Error fetching show ${slug}:`, error);
    throw new Error(`Failed to fetch show ${slug}`);
  }
}

// ================================================
// AVAILABILITY FUNCTIONS
// ================================================

/**
 * Update available seats count for a show
 */
export async function updateAvailableSeats(
  showId: number,
  availableSeats: number
): Promise<boolean> {
  try {
    const validatedId = validateNumericId(showId);
    
    await db
      .update(shows)
      .set({
        availableSeats,
        updatedAt: new Date(),
      })
      .where(eq(shows.id, validatedId));
    
    console.log(`✅ Updated available seats for show ${showId}: ${availableSeats}`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating available seats for show ${showId}:`, error);
    return false;
  }
}

/**
 * Check if show is sold out
 */
export async function isShowSoldOut(showId: number): Promise<boolean> {
  try {
    const show = await getShowById(showId);
    
    if (!show) {
      throw new Error(`Show ${showId} not found`);
    }
    
    return show.status === 'sold_out' || show.availability.availableSeats === 0;
  } catch (error) {
    console.error(`❌ Error checking sold out status for show ${showId}:`, error);
    throw error;
  }
}

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Transform database show to API format
 */
function transformShowToAPI(show: Show): APIShow {
  return {
    id: show.id,
    slug: show.slug,
    title: show.title,
    description: show.description || undefined,
    venue: {
      name: show.venueName,
      address: show.venueAddress || undefined,
    },
    datetime: {
      date: show.showDate,
      time: show.showTime,
      duration: show.durationMinutes || 150,
    },
    pricing: {
      minPricePence: show.basePricePence,
      maxPricePence: show.maxPricePence,
      currency: 'GBP',
    },
    availability: {
      totalCapacity: show.totalCapacity || 0,
      availableSeats: show.availableSeats || 0,
      soldOut: show.status === 'sold_out' || (show.availableSeats || 0) === 0,
    },
    status: show.status as 'active' | 'sold_out' | 'cancelled' | 'draft',
    category: show.category || 'musical',
    ageRating: show.ageRating || 'PG',
    language: show.language || 'EN',
    seatmap: {
      venueId: show.seatmapVenueId || '',
      showSlug: show.seatmapShowSlug || '',
    },
  };
}

/**
 * Format price from pence to pounds for display
 */
export function formatPrice(pricePence: number): string {
  const pounds = pricePence / 100;
  return `£${pounds.toFixed(2)}`;
}

/**
 * Calculate show duration in human-readable format
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours === 0) {
    return `${remainingMinutes}m`;
  }
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}m`;
}