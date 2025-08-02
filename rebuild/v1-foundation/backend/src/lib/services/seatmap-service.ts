/**
 * LML v1 Foundation - Seatmap Service
 * ==================================
 * Business logic for seatmap data merging
 * MongoDB layout + PostgreSQL pricing = Complete seatmap
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { getSeatmapsCollection, getVenuesCollection } from '../db/mongodb';
import { getRedisClient, areSeatsReserved } from '../db/redis';
import { getShowById } from './show-service';
import { validateNumericId } from '../utils/validation';
import { 
  validateSeatMapping, 
  detectSeatDataDesync,
  normalizeSeatId 
} from '../utils/seat-id-convention';
import type { 
  SeatMapResponse, 
  SeatMapData, 
  Seat, 
  SeatSection,
  VenueLayout 
} from '../types/api';

// ================================================
// MAIN SEATMAP BUILDING FUNCTION
// ================================================

/**
 * Build complete seatmap by merging MongoDB layout with PostgreSQL pricing
 */
export async function buildSeatMap(showId: number): Promise<SeatMapResponse | null> {
  try {
    const validatedShowId = validateNumericId(showId);
    
    console.log(`🔄 Building seatmap for show ${validatedShowId}`);
    
    // 1. Get show data from PostgreSQL
    const show = await getShowById(validatedShowId);
    if (!show) {
      console.log(`❌ Show ${validatedShowId} not found`);
      return null;
    }
    
    const { venueId, showSlug } = show.seatmap;
    console.log(`🏛️ Venue: ${venueId}, Show: ${showSlug}`);
    
    // 2. Get venue layout from MongoDB
    const venueLayout = await getVenueLayout(venueId);
    if (!venueLayout) {
      console.log(`❌ Venue layout not found for ${venueId}`);
      return null;
    }
    
    // 3. Get seatmap data from MongoDB
    const seatmapData = await getSeatmapData(venueId, showSlug);
    if (!seatmapData) {
      console.log(`❌ Seatmap data not found for ${venueId}/${showSlug}`);
      return null;
    }
    
    // 4. Validate seat ID mapping and data consistency
    const validationResult = await validateSeatMapData(seatmapData, show);
    if (!validationResult.isValid) {
      console.error(`❌ Seat mapping validation failed: ${validationResult.errors.join(', ')}`);
      throw new Error(`Seat mapping validation failed: ${validationResult.errors[0]}`);
    }
    
    // 5. Merge pricing data from PostgreSQL
    const enrichedSeatMap = await enrichSeatMapWithPricing(seatmapData, show);
    
    // 6. Check seat reservations from Redis
    const finalSeatMap = await addReservationStatus(enrichedSeatMap, validatedShowId);
    
    console.log(`✅ Built seatmap: ${finalSeatMap.metadata.totalSeats} seats, ${finalSeatMap.metadata.availableSeats} available`);
    
    return {
      showId: validatedShowId,
      venueId,
      showSlug,
      seatMap: finalSeatMap,
      metadata: {
        ...finalSeatMap.metadata,
        dataSource: 'hybrid',
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`❌ Error building seatmap for show ${showId}:`, error);
    throw error;
  }
}

// ================================================
// MONGODB DATA RETRIEVAL
// ================================================

/**
 * Get venue layout (stage, aisles, labels) from MongoDB
 */
async function getVenueLayout(venueId: string): Promise<VenueLayout | null> {
  try {
    const venuesCollection = await getVenuesCollection();
    const venue = await venuesCollection.findOne({ _id: venueId });
    
    if (!venue) {
      return null;
    }
    
    return {
      width: venue.viewport?.width || 1200,
      height: venue.viewport?.height || 900,
      scale: 1.0,
      levels: venue.levels?.length || 1,
      centerX: (venue.viewport?.width || 1200) / 2,
      centerY: (venue.viewport?.height || 900) / 2,
      stage: venue.stage ? {
        x: venue.stage.position?.x || 0,
        y: venue.stage.position?.y || 0,
        width: venue.stage.dimensions?.width || 400,
        height: venue.stage.dimensions?.height || 50,
        title: venue.stage.title || 'STAGE',
        backgroundColor: venue.stage.backgroundColor,
        borderColor: venue.stage.borderColor,
      } : undefined,
      aisles: venue.aisles?.map((aisle: any) => ({
        id: aisle.id,
        x: aisle.position?.x || 0,
        y: aisle.position?.y || 0,
        width: aisle.dimensions?.width || 25,
        height: aisle.dimensions?.height || 100,
        color: aisle.color,
        opacity: aisle.opacity,
      })) || [],
      labels: [], // TODO: Add labels when implemented
      accessibilitySpots: venue.accessibility_spots?.map((spot: any) => ({
        id: spot.id,
        type: spot.type,
        x: spot.position?.x || 0,
        y: spot.position?.y || 0,
        description: spot.description,
      })) || [],
    };
  } catch (error) {
    console.error(`❌ Error fetching venue layout for ${venueId}:`, error);
    return null;
  }
}

/**
 * Get seatmap data (sections and seats) from MongoDB
 */
async function getSeatmapData(venueId: string, showSlug: string): Promise<Partial<SeatMapData> | null> {
  try {
    const seatmapsCollection = await getSeatmapsCollection();
    
    // Try exact match first
    let seatmap = await seatmapsCollection.findOne({
      venue_id: venueId,
      show_slug: showSlug,
    });
    
    // Fallback to venue-based template
    if (!seatmap) {
      console.log(`⚠️ No exact seatmap found, trying venue template for ${venueId}`);
      seatmap = await seatmapsCollection.findOne({
        venue_id: venueId,
      });
    }
    
    if (!seatmap) {
      return null;
    }
    
    // Transform MongoDB sections to API format
    const sections: Record<string, SeatSection> = {};
    
    for (const section of seatmap.sections || []) {
      sections[section.id] = {
        id: section.id,
        displayName: section.name,
        color: section.color,
        priceCategory: section.price_category,
        seats: section.seats?.map((seat: any) => ({
          hardcodedId: seat.id,
          layoutId: seat.id,
          row: seat.row,
          number: seat.number,
          x: seat.position?.x || 0,
          y: seat.position?.y || 0,
          isAccessible: seat.accessibility || false,
          seatType: section.price_category || 'standard',
          pricePence: seat.base_price_pence || 5000, // Default £50
          isAvailable: seat.status === 'available',
          isReserved: false, // Will be updated later
          color: section.color,
          level: 0, // TODO: Calculate from section
          viewQuality: 'good', // TODO: Calculate based on position
        })) || [],
        visualConfig: {
          startX: 0,
          startY: 0,
          rows: 1,
          seatsPerRow: section.seats?.length || 0,
          seatSpacing: 30,
          rowSpacing: 40,
        },
      };
    }
    
    const totalSeats = Object.values(sections).reduce((sum, section) => sum + section.seats.length, 0);
    const availableSeats = Object.values(sections).reduce((sum, section) => 
      sum + section.seats.filter(seat => seat.isAvailable).length, 0
    );
    
    const allSeats = Object.values(sections).flatMap(section => section.seats);
    const prices = allSeats.map(seat => seat.pricePence);
    
    return {
      sections,
      metadata: {
        totalSeats,
        availableSeats,
        priceRange: {
          min: Math.min(...prices),
          max: Math.max(...prices),
        },
        accessibleSeats: allSeats.filter(seat => seat.isAccessible).length,
        levels: [...new Set(allSeats.map(seat => `Level ${seat.level}`))],
      },
    };
  } catch (error) {
    console.error(`❌ Error fetching seatmap data for ${venueId}/${showSlug}:`, error);
    return null;
  }
}

// ================================================
// DATA ENRICHMENT FUNCTIONS
// ================================================

/**
 * Enrich seatmap with PostgreSQL pricing and availability data
 */
async function enrichSeatMapWithPricing(
  seatmapData: Partial<SeatMapData>,
  show: any
): Promise<SeatMapData> {
  // For now, use the MongoDB pricing data
  // TODO: Implement PostgreSQL pricing lookup when seat pricing table is added
  
  const layout: VenueLayout = {
    width: 1200,
    height: 900,
    scale: 1.0,
    levels: 1,
    centerX: 600,
    centerY: 450,
  };
  
  return {
    sections: seatmapData.sections || {},
    layout,
    metadata: seatmapData.metadata || {
      totalSeats: 0,
      availableSeats: 0,
      priceRange: { min: 0, max: 0 },
      accessibleSeats: 0,
      levels: [],
    },
  };
}

/**
 * Add Redis reservation status to seats
 */
async function addReservationStatus(
  seatmapData: SeatMapData,
  showId: number
): Promise<SeatMapData> {
  try {
    // Collect all seat IDs
    const allSeatIds: string[] = [];
    Object.values(seatmapData.sections).forEach(section => {
      section.seats.forEach(seat => {
        allSeatIds.push(seat.hardcodedId);
      });
    });
    
    // Check reservations in Redis
    const reservations = await areSeatsReserved(showId, allSeatIds);
    
    // Update seat reservation status
    Object.values(seatmapData.sections).forEach(section => {
      section.seats.forEach(seat => {
        seat.isReserved = reservations[seat.hardcodedId] || false;
        
        // If reserved, mark as unavailable for selection
        if (seat.isReserved) {
          seat.isAvailable = false;
        }
      });
    });
    
    // Recalculate available seats
    const availableSeats = Object.values(seatmapData.sections).reduce((sum, section) =>
      sum + section.seats.filter(seat => seat.isAvailable).length, 0
    );
    
    seatmapData.metadata.availableSeats = availableSeats;
    
    return seatmapData;
  } catch (error) {
    console.error('❌ Error checking seat reservations:', error);
    // Return original data if Redis check fails
    return seatmapData;
  }
}

// ================================================
// VALIDATION FUNCTIONS
// ================================================

/**
 * Validate seatmap data consistency and seat ID convention
 */
async function validateSeatMapData(
  seatmapData: Partial<SeatMapData>,
  show: any
): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Extract all seats from sections
    const allSeats: Array<{ id: string; [key: string]: any }> = [];
    
    if (seatmapData.sections) {
      Object.values(seatmapData.sections).forEach(section => {
        section.seats?.forEach(seat => {
          allSeats.push({ id: seat.hardcodedId, ...seat });
        });
      });
    }
    
    // Validate seat ID mapping
    const mappingValidation = validateSeatMapping(allSeats);
    
    if (mappingValidation.errors.length > 0) {
      errors.push(...mappingValidation.errors);
    }
    
    // Check for data desync
    const desyncResult = detectSeatDataDesync(allSeats);
    
    if (desyncResult.hasDesync) {
      if (desyncResult.severity === 'high') {
        errors.push(`Critical seat data desync detected: ${desyncResult.issues.join(', ')}`);
      } else {
        warnings.push(`Seat data inconsistencies detected: ${desyncResult.issues.join(', ')}`);
      }
    }
    
    // Validate minimum seat count
    if (allSeats.length === 0) {
      errors.push('No seats found in seatmap data');
    } else if (allSeats.length < 10) {
      warnings.push(`Very low seat count: ${allSeats.length} seats (expected 100+)`);
    }
    
    // Validate section consistency
    if (seatmapData.sections) {
      const sectionCount = Object.keys(seatmapData.sections).length;
      if (sectionCount === 0) {
        errors.push('No sections found in seatmap data');
      } else if (sectionCount === 1) {
        warnings.push('Only one section found (typical venues have multiple sections)');
      }
    }
    
    // Log validation results
    if (errors.length > 0) {
      console.error(`❌ Seat mapping validation failed for show ${show.id}:`);
      errors.forEach(error => console.error(`  • ${error}`));
    }
    
    if (warnings.length > 0) {
      console.warn(`⚠️ Seat mapping warnings for show ${show.id}:`);
      warnings.forEach(warning => console.warn(`  • ${warning}`));
    }
    
    if (errors.length === 0 && warnings.length === 0) {
      console.log(`✅ Seat mapping validation passed for show ${show.id}: ${mappingValidation.validSeats}/${mappingValidation.totalSeats} valid seats`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    console.error('❌ Error during seat mapping validation:', error);
    return {
      isValid: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
    };
  }
}

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Get seat by ID from seatmap
 */
export function getSeatById(seatMap: SeatMapData, seatId: string): Seat | null {
  for (const section of Object.values(seatMap.sections)) {
    const seat = section.seats.find(s => s.hardcodedId === seatId);
    if (seat) {
      return seat;
    }
  }
  return null;
}

/**
 * Calculate total price for selected seats
 */
export function calculateTotalPrice(seatMap: SeatMapData, seatIds: string[]): number {
  let total = 0;
  
  for (const seatId of seatIds) {
    const seat = getSeatById(seatMap, seatId);
    if (seat) {
      total += seat.pricePence;
    }
  }
  
  return total;
}