import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateSeatId } from '../../../../lib/services/mongodb/utils/seat-id-generator';
import { validateLayout, prepareLayoutForSave } from '../../../../lib/services/mongodb/validation/layout-schema';
import { VenueLayout } from '../../../../lib/services/mongodb/types/venue-layout';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Royal Opera House MongoDB Pipeline Test...');
    
    console.log('🚀 Starting in-memory MongoDB server...');
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    
    console.log('🔌 Creating MongoDB client...');
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    
    console.log('🗄️ Getting database...');
    const db = client.db('lml_seatmaps');
    
    console.log('📋 Getting collection...');
    const collection = db.collection('royal_opera_house');
    
    console.log('🎭 Generating Mini Royal Opera House Layout (50 seats with coordinates)...');
    
    const layoutId = 'mini-royal-opera-house-test';
    
    // Generate seats with actual x,y coordinates for rendering
    const seats = [];
    
    // STALLS SECTION - 24 seats (3 rows × 8 seats) - Closest to stage
    const stallsRows = ['A', 'B', 'C'];
    stallsRows.forEach((row, rowIndex) => {
      for (let seatNum = 1; seatNum <= 8; seatNum++) {
        const x = 0.25 + (seatNum - 1) * 0.0625; // Seats spread from x=0.25 to x=0.75
        const y = 0.3 + rowIndex * 0.05; // Rows at y=0.3, 0.35, 0.4
        
        // ✅ NEW: Generate deterministic seat ID using approved method
        const seatId = generateSeatId(layoutId, 'stalls', row, seatNum);
        
        seats.push({
          seatId: seatId,               // ✅ NEW: SHA-256 hash seat ID
          section: 'stalls',
          row: row,
          number: seatNum,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          category: 'premium',
          facing: 'stage',
          labels: {
            en: `${row}${seatNum}`,
            display: `Stalls ${row}${seatNum}`
          }
        });
      }
    });
    
    // GRAND TIER SECTION - 16 seats (2 rows × 8 seats) - Elevated
    const grandTierRows = ['A', 'B'];
    grandTierRows.forEach((row, rowIndex) => {
      for (let seatNum = 1; seatNum <= 8; seatNum++) {
        const x = 0.25 + (seatNum - 1) * 0.0625; // Same x spacing as stalls
        const y = 0.6 + rowIndex * 0.05; // Elevated: y=0.6, 0.65
        
        // ✅ NEW: Generate deterministic seat ID
        const seatId = generateSeatId(layoutId, 'grand-tier', row, seatNum);
        
        seats.push({
          seatId: seatId,               // ✅ NEW: SHA-256 hash seat ID
          section: 'grand-tier',
          row: row,
          number: seatNum,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          category: 'standard',
          facing: 'stage',
          labels: {
            en: `GT${row}${seatNum}`,
            display: `Grand Tier ${row}${seatNum}`
          }
        });
      }
    });
    
    // BALCONY SECTION - 10 seats (1 row × 10 seats) - Highest level
    for (let seatNum = 1; seatNum <= 10; seatNum++) {
      const x = 0.2 + (seatNum - 1) * 0.06; // Slightly wider spread: x=0.2 to x=0.74
      const y = 0.8; // Highest level
      
      // ✅ NEW: Generate deterministic seat ID
      const seatId = generateSeatId(layoutId, 'balcony', 'A', seatNum);
      
      seats.push({
        seatId: seatId,               // ✅ NEW: SHA-256 hash seat ID
        section: 'balcony',
        row: 'A',
        number: seatNum,
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000,
        category: 'economy',
        facing: 'stage',
        labels: {
          en: `BA${seatNum}`,
          display: `Balcony A${seatNum}`
        }
      });
    }
    
    // ✅ NEW: Create layout using approved schema structure
    const rawLayout: Partial<VenueLayout> = {
      layoutId: layoutId,
      venueId: 'venue-mini-royal-opera-house',
      name: 'Mini Royal Opera House - Coordinate Test',
      description: 'Test layout with 50 seats and full x,y coordinates for rendering engine',
      version: '1.0.0',
      status: 'draft',
      layoutType: 'seated',                // ✅ NEW: Layout type classification
      viewport: {                          // ✅ NEW: Updated viewport structure
        width: 1200,
        height: 800,
        unit: 'relative'
      },
      seats: seats,
      sections: [
        { 
          sectionId: 'stalls',
          name: 'Stalls', 
          capacity: 24,
          level: 0,
          bounds: { minX: 0.25, maxX: 0.75, minY: 0.3, maxY: 0.4 }
        },
        { 
          sectionId: 'grand-tier',
          name: 'Grand Tier', 
          capacity: 16,
          level: 1,
          bounds: { minX: 0.25, maxX: 0.75, minY: 0.6, maxY: 0.65 }
        },
        { 
          sectionId: 'balcony',
          name: 'Balcony', 
          capacity: 10,
          level: 2,
          bounds: { minX: 0.2, maxX: 0.74, minY: 0.8, maxY: 0.8 }
        }
      ],
      zones: [
        {
          zoneId: 'stage-main',
          type: 'stage',
          name: 'Main Stage',
          coordinates: [
            [0.25, 0.0],
            [0.75, 0.0],
            [0.75, 0.15],
            [0.25, 0.15]
          ]
        },
        {
          zoneId: 'orchestra-pit',
          type: 'orchestra_pit',
          name: 'Orchestra Pit',
          coordinates: [
            [0.3, 0.15],
            [0.7, 0.15],
            [0.65, 0.25],
            [0.35, 0.25]
          ]
        },
        {
          zoneId: 'aisle-center',
          type: 'aisle',
          name: 'Center Aisle',
          coordinates: [
            [0.48, 0.25],
            [0.52, 0.25],
            [0.52, 0.85],
            [0.48, 0.85]
          ]
        }
      ]
    };
    
    // ✅ NEW: Prepare layout for save (generates hash, seat IDs, timestamps)
    const miniRoyalOperaHouse = prepareLayoutForSave(rawLayout);
    
    // ✅ NEW: Validate layout before saving
    console.log('🔍 Validating layout...');
    const validationErrors = validateLayout(miniRoyalOperaHouse);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }
    console.log('✅ Layout validation passed');
    
    console.log('✏️ Inserting Mini Royal Opera House layout...');
    const insertResult = await collection.insertOne(miniRoyalOperaHouse);
    
    console.log('🔍 Reading Mini Royal Opera House layout with coordinates...');
    const doc = await collection.findOne({ _id: insertResult.insertedId });
    
    console.log('🧹 Cleaning up...');
    await collection.deleteOne({ _id: insertResult.insertedId });
    
    console.log('🔌 Closing connection...');
    await client.close();
    
    console.log('🛑 Stopping in-memory MongoDB server...');
    await mongoServer.stop();
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Mini Royal Opera House coordinate pipeline test completed in ${responseTime}ms`);
    
    return NextResponse.json({
      success: true,
      testType: 'Mini Royal Opera House Coordinate Pipeline',
      data: {
        message: 'Mini Royal Opera House coordinate pipeline test successful',
        responseTime,
        insertedId: insertResult.insertedId,

        // ✅ NEW: Updated statistics with production schema fields
        layout: {
          layoutId: doc?.layoutId,
          venueId: doc?.venueId,
          name: doc?.name,
          version: doc?.version,
          status: doc?.status,
          layoutType: doc?.layoutType,
          layoutHash: doc?.layoutHash
        },
        statistics: {
          totalSeats: doc?.seats?.length || 0,
          totalSections: doc?.sections?.length || 0,
          totalZones: doc?.zones?.length || 0,
          coordinateSystem: 'normalized_0_to_1',
          renderingReady: true,
          schemaVersion: '1.0.0'
        },
        viewport: doc?.viewport,
        sections: doc?.sections?.map(s => ({
          sectionId: s.sectionId,
          name: s.name,
          capacity: s.capacity,
          level: s.level,
          bounds: s.bounds
        })),
        zones: doc?.zones?.map(z => ({
          zoneId: z.zoneId,
          type: z.type,
          name: z.name,
          coordinates: z.coordinates
        })),
        // ✅ NEW: Sample seats showing deterministic seat IDs
        sampleSeats: doc?.seats?.slice(0, 5).map(seat => ({
          seatId: seat.seatId,           // ✅ NEW: SHA-256 hash
          section: seat.section,
          row: seat.row,
          number: seat.number,
          x: seat.x,
          y: seat.y,
          category: seat.category,
          facing: seat.facing,
          labels: seat.labels
        })),
        // ✅ NEW: Enhanced validation results
        validation: {
          schemaCompliant: true,
          allSeatsHaveCoordinates: doc?.seats?.every(s => typeof s.x === 'number' && typeof s.y === 'number'),
          coordinateRangeValid: doc?.seats?.every(s => s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1),
          allSeatsHaveSeatIds: doc?.seats?.every(s => s.seatId && /^[a-f0-9]{64}$/.test(s.seatId)),
          seatIdUniqueness: new Set(doc?.seats?.map(s => s.seatId)).size === doc?.seats?.length,
          layoutHashValid: !!doc?.layoutHash && /^[a-f0-9]{64}$/.test(doc?.layoutHash),
          totalSeatsWithCoords: doc?.seats?.length || 0
        }
      }
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Direct MongoDB test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Mini Royal Opera House coordinate pipeline test failed',
      details: error instanceof Error ? error.message : String(error),
      responseTime
    }, { status: 500 });
  }
}