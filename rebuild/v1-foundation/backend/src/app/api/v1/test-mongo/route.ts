import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Direct MongoDB connection test...');
    
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not found');
    }
    
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
    const collection = db.collection('test_direct');
    
    console.log('✏️ Inserting test document...');
    const insertResult = await collection.insertOne({
      test: true,
      timestamp: new Date(),
      message: 'Direct MongoDB test'
    });
    
    console.log('🔍 Reading test document...');
    const doc = await collection.findOne({ _id: insertResult.insertedId });
    
    console.log('🧹 Cleaning up...');
    await collection.deleteOne({ _id: insertResult.insertedId });
    
    console.log('🔌 Closing connection...');
    await client.close();
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Direct MongoDB test completed in ${responseTime}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Direct MongoDB connection test successful',
        responseTime,
        insertedId: insertResult.insertedId,
        retrievedDoc: doc
      }
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Direct MongoDB test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Direct MongoDB test failed',
      details: error instanceof Error ? error.message : String(error),
      responseTime
    }, { status: 500 });
  }
}