/**
 * LML v1 Foundation - MongoDB Connection
 * =====================================
 * MongoDB connection for seatmap layout data
 * Created: 2025-08-01
 * Status: Phase 1 - API Foundation
 */

import { MongoClient, Db, Collection } from 'mongodb';

// ================================================
// CONNECTION CONFIGURATION
// ================================================

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'lml_seatmaps';

if (!mongoUri) {
  throw new Error('MONGODB_URI environment variable is required');
}

// ================================================
// CONNECTION SINGLETON
// ================================================

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToMongoDB(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 Database:', mongoDbName);

    client = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db(mongoDbName);

    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// ================================================
// COLLECTION ACCESSORS
// ================================================

export async function getVenuesCollection(): Promise<Collection> {
  const database = await connectToMongoDB();
  return database.collection('venues');
}

export async function getSeatmapsCollection(): Promise<Collection> {
  const database = await connectToMongoDB();
  return database.collection('seatmaps');
}

// ================================================
// CONNECTION HEALTH CHECK
// ================================================

export async function checkMongoDBHealth(): Promise<{
  status: 'connected' | 'error';
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const database = await connectToMongoDB();
    
    // Simple ping to verify connection
    await database.admin().ping();
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'connected',
      responseTime
    };
  } catch (error) {
    console.error('MongoDB health check failed:', error);
    
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ================================================
// GRACEFUL SHUTDOWN
// ================================================

export async function closeMongoDBConnection(): Promise<void> {
  try {
    if (client) {
      await client.close();
      client = null;
      db = null;
      console.log('✅ MongoDB connection closed gracefully');
    }
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
}

// Handle process termination
process.on('SIGTERM', closeMongoDBConnection);
process.on('SIGINT', closeMongoDBConnection);