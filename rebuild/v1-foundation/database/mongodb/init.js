// Last Minute Live - Clean MongoDB Initialization
// ================================================
// MongoDB: Seatmap Data Only (Venues, Seat Coordinates)

// Switch to the seatmaps database
db = db.getSiblingDB('lml_seatmaps');

// Create application user
db.createUser({
  user: 'lml_app',
  pwd: 'lml_mongo_app_pass',
  roles: [
    {
      role: 'readWrite',
      db: 'lml_seatmaps'
    }
  ]
});

// ================================================
// VENUES COLLECTION - Theater/venue information
// ================================================
db.createCollection('venues', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'name', 'capacity', 'viewport', 'stage'],
      properties: {
        _id: {
          bsonType: 'string',
          description: 'Venue ID - must be unique'
        },
        name: {
          bsonType: 'string',
          description: 'Venue name'
        },
        address: {
          bsonType: 'string',
          description: 'Full venue address'
        },
        capacity: {
          bsonType: 'int',
          minimum: 1,
          description: 'Total venue capacity'
        },
        levels: {
          bsonType: 'array',
          items: {
            bsonType: 'string'
          },
          description: 'Theater levels like Stalls, Circle, etc.'
        },
        viewport: {
          bsonType: 'object',
          required: ['width', 'height'],
          properties: {
            width: { bsonType: 'number', minimum: 100 },
            height: { bsonType: 'number', minimum: 100 }
          }
        },
        stage: {
          bsonType: 'object',
          required: ['position', 'dimensions', 'title'],
          properties: {
            position: {
              bsonType: 'object',
              required: ['x', 'y'],
              properties: {
                x: { bsonType: 'number' },
                y: { bsonType: 'number' }
              }
            },
            dimensions: {
              bsonType: 'object',
              required: ['width', 'height'],
              properties: {
                width: { bsonType: 'number', minimum: 1 },
                height: { bsonType: 'number', minimum: 1 }
              }
            },
            title: { bsonType: 'string' }
          }
        },
        aisles: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['id', 'position', 'dimensions'],
            properties: {
              id: { bsonType: 'string' },
              position: {
                bsonType: 'object',
                required: ['x', 'y'],
                properties: {
                  x: { bsonType: 'number' },
                  y: { bsonType: 'number' }
                }
              },
              dimensions: {
                bsonType: 'object',
                required: ['width', 'height'],
                properties: {
                  width: { bsonType: 'number' },
                  height: { bsonType: 'number' }
                }
              },
              color: { bsonType: 'string' },
              opacity: { bsonType: 'number' }
            }
          }
        },
        accessibility_spots: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['id', 'position', 'type'],
            properties: {
              id: { bsonType: 'string' },
              position: {
                bsonType: 'object',
                required: ['x', 'y'],
                properties: {
                  x: { bsonType: 'number' },
                  y: { bsonType: 'number' }
                }
              },
              type: { bsonType: 'string' }
            }
          }
        }
      }
    }
  }
});

// ================================================
// SEATMAPS COLLECTION - Show-specific seat layouts
// ================================================
db.createCollection('seatmaps', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'venue_id', 'show_slug', 'sections', 'metadata'],
      properties: {
        _id: {
          bsonType: 'string',
          description: 'Unique seatmap ID - format: show-venue-date'
        },
        venue_id: {
          bsonType: 'string',
          description: 'References venues collection'
        },
        show_slug: {
          bsonType: 'string',
          description: 'Show identifier for PostgreSQL linking'
        },
        show_title: {
          bsonType: 'string',
          description: 'Show title for display'
        },
        sections: {
          bsonType: 'array',
          minItems: 1,
          items: {
            bsonType: 'object',
            required: ['id', 'name', 'color', 'seats'],
            properties: {
              id: { bsonType: 'string' },
              name: { bsonType: 'string' },
              color: { bsonType: 'string' },
              price_category: { bsonType: 'string' },
              seats: {
                bsonType: 'array',
                items: {
                  bsonType: 'object',
                  required: ['id', 'row', 'number', 'position', 'status', 'base_price_pence'],
                  properties: {
                    id: { bsonType: 'string' },
                    row: { bsonType: 'string' },
                    number: { bsonType: 'int', minimum: 1 },
                    position: {
                      bsonType: 'object',
                      required: ['x', 'y'],
                      properties: {
                        x: { bsonType: 'number' },
                        y: { bsonType: 'number' }
                      }
                    },
                    status: {
                      bsonType: 'string',
                      enum: ['available', 'booked', 'held', 'blocked']
                    },
                    base_price_pence: {
                      bsonType: 'int',
                      minimum: 1
                    },
                    accessibility: { bsonType: 'bool' }
                  }
                }
              }
            }
          }
        },
        metadata: {
          bsonType: 'object',
          required: ['total_seats', 'last_updated'],
          properties: {
            total_seats: { bsonType: 'int', minimum: 1 },
            last_updated: { bsonType: 'date' },
            data_source: { bsonType: 'string' },
            version: { bsonType: 'string' }
          }
        }
      }
    }
  }
});

// ================================================
// INDEXES FOR PERFORMANCE
// ================================================

// Venues collection indexes
db.venues.createIndex({ "name": 1 });
db.venues.createIndex({ "capacity": 1 });

// Seatmaps collection indexes  
db.seatmaps.createIndex({ "venue_id": 1 });
db.seatmaps.createIndex({ "show_slug": 1 });
db.seatmaps.createIndex({ "venue_id": 1, "show_slug": 1 }, { unique: true });
db.seatmaps.createIndex({ "sections.seats.status": 1 });
db.seatmaps.createIndex({ "sections.seats.id": 1 });
db.seatmaps.createIndex({ "metadata.last_updated": 1 });

// ================================================
// SAMPLE DATA - Clean examples
// ================================================

// Insert sample venue (Her Majesty's Theatre)
db.venues.insertOne({
  "_id": "her-majestys-theatre",
  "name": "Her Majesty's Theatre", 
  "address": "Haymarket, St. James's, London SW1Y 4QL",
  "capacity": 1216,
  "levels": ["Stalls", "Dress Circle", "Upper Circle", "Boxes"],
  "viewport": {
    "width": 1200,
    "height": 900
  },
  "stage": {
    "position": { "x": 600, "y": 40 },
    "dimensions": { "width": 400, "height": 50 },
    "title": "STAGE",
    "backgroundColor": "#1A1A1A",
    "borderColor": "#333333"
  },
  "aisles": [
    {
      "id": "grand-center-aisle",
      "position": { "x": 600, "y": 450 },
      "dimensions": { "width": 25, "height": 500 },
      "color": "#2A2A2A",
      "opacity": 0.6
    }
  ],
  "accessibility_spots": [
    {
      "id": "wheelchair-area-1",
      "position": { "x": 100, "y": 500 },
      "type": "wheelchair"
    }
  ],
  "created_at": new Date(),
  "updated_at": new Date()
});

// Insert sample seatmap (basic template - will be replaced with real data)
db.seatmaps.insertOne({
  "_id": "phantom-her-majestys-template",
  "venue_id": "her-majestys-theatre",
  "show_slug": "phantom-template",
  "show_title": "The Phantom of the Opera - Template",
  "sections": [
    {
      "id": "stalls",
      "name": "Stalls",
      "color": "#FF6B6B",
      "price_category": "premium",
      "seats": [
        {
          "id": "stalls-A-1",
          "row": "A",
          "number": 1,
          "position": { "x": 450, "y": 400 },
          "status": "available",
          "base_price_pence": 15000,
          "accessibility": false
        },
        {
          "id": "stalls-A-2", 
          "row": "A",
          "number": 2,
          "position": { "x": 480, "y": 400 },
          "status": "available",
          "base_price_pence": 15000,
          "accessibility": false
        }
      ]
    }
  ],
  "metadata": {
    "total_seats": 2,
    "last_updated": new Date(),
    "data_source": "template",
    "version": "1.0"
  }
});

print("✅ MongoDB initialization complete!");
print("📊 Collections created: venues, seatmaps");
print("👤 Application user created: lml_app");
print("🗂️ Sample data inserted for Her Majesty's Theatre");
print("📋 Ready for real seatmap data upload!");