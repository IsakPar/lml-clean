/**
 * LML v1 Foundation - Minimal MongoDB Service
 * ==========================================
 * Ultra-simple MongoDB service based on working external script
 */

import { MongoClient, Db } from 'mongodb';

const MONGO_CONFIG = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 5000,
  waitQueueTimeoutMS: 5000,
  maxPoolSize: 1,
  minPoolSize: 0,
  maxIdleTimeMS: 5000,
  retryWrites: true,
  retryReads: true,
};

function getMongoURI(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');
  return uri;
}

async function connectMongoDB<T>(operation: (db: Db) => Promise<T>): Promise<T> {
  let client: MongoClient | null = null;
  
  try {
    client = new MongoClient(getMongoURI(), MONGO_CONFIG);
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);
    
    const db = client.db(process.env.MONGODB_DB || 'lml_seatmaps');
    return await operation(db);
  } finally {
    if (client) await client.close().catch(console.warn);
  }
}

export async function testMongoConnection(): Promise<string[]> {
  return connectMongoDB(async (db) => {
    await db.admin().ping();
    const collections = await db.listCollections().toArray();
    return collections.map(c => c.name);
  });
}
