#!/usr/bin/env tsx

/**
 * LML v1 Foundation - Test Data Seeder
 * ===================================
 * Seeds the database with comprehensive test data for development
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { db } from '../src/lib/db/postgres';
import { shows } from '../src/lib/db/schema';

async function seedTestData() {
  console.log('🌱 Seeding test data...');

  try {
    // Test shows data
    const testShows = [
      {
        slug: 'hamilton-london',
        title: 'Hamilton',
        description: 'The revolutionary musical that tells the story of Alexander Hamilton',
        venueName: 'Victoria Palace Theatre',
        venueAddress: '126 Victoria St, London SW1E 6QX',
        showDate: new Date('2025-08-15'),
        showTime: '19:30:00',
        durationMinutes: 165,
        basePricePence: 2500, // £25.00
        maxPricePence: 17000, // £170.00
        totalCapacity: 1550,
        availableSeats: 892,
        seatmapVenueId: 'victoria-palace-theatre',
        seatmapShowSlug: 'hamilton-2025',
        status: 'active',
        category: 'musical',
        ageRating: 'PG',
        language: 'EN',
      },
      {
        slug: 'phantom-opera',
        title: 'The Phantom of the Opera',
        description: 'Andrew Lloyd Webber\'s legendary musical',
        venueName: 'Her Majesty\'s Theatre',
        venueAddress: 'Haymarket, St. James\'s, London SW1Y 4QL',
        showDate: new Date('2025-08-20'),
        showTime: '19:30:00',
        durationMinutes: 150,
        basePricePence: 3000, // £30.00
        maxPricePence: 15000, // £150.00
        totalCapacity: 1216,
        availableSeats: 456,
        seatmapVenueId: 'her-majestys-theatre',
        seatmapShowSlug: 'phantom-2025',
        status: 'active',
        category: 'musical',
        ageRating: 'PG',
        language: 'EN',
      },
      {
        slug: 'lion-king',
        title: 'The Lion King',
        description: 'Disney\'s award-winning musical',
        venueName: 'Lyceum Theatre',
        venueAddress: '21 Wellington St, London WC2E 7RQ',
        showDate: new Date('2025-08-25'),
        showTime: '14:30:00',
        durationMinutes: 150,
        basePricePence: 2000, // £20.00
        maxPricePence: 12500, // £125.00
        totalCapacity: 2100,
        availableSeats: 1200,
        seatmapVenueId: 'lyceum-theatre',
        seatmapShowSlug: 'lion-king-2025',
        status: 'active',
        category: 'musical',
        ageRating: 'U',
        language: 'EN',
      },
    ];

    // Clear existing shows
    console.log('🧹 Clearing existing shows...');
    await db.delete(shows);

    // Insert test shows
    console.log('📝 Inserting test shows...');
    await db.insert(shows).values(testShows);

    console.log(`✅ Successfully seeded ${testShows.length} test shows`);

    // Display results
    console.log('\n📋 Seeded shows:');
    testShows.forEach((show, index) => {
      console.log(`  ${index + 1}. ${show.title} - ${show.venueName}`);
      console.log(`     Date: ${show.showDate.toDateString()} ${show.showTime}`);
      console.log(`     Prices: £${(show.basePricePence / 100).toFixed(2)} - £${(show.maxPricePence / 100).toFixed(2)}`);
      console.log(`     Available: ${show.availableSeats}/${show.totalCapacity} seats\n`);
    });

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('🎉 Test data seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test data seeding failed:', error);
      process.exit(1);
    });
}

export { seedTestData };