#!/usr/bin/env node

/**
 * External MongoDB Connection Test
 * Isolated from Next.js to diagnose Node.js driver issues
 */

const { MongoClient } = require('mongodb');

async function testMongoConnection() {
  console.log('🧪 External MongoDB Node.js Driver Test');
  console.log('=====================================');
  
  const uri = 'mongodb://lml_admin:lml_mongo_pass@localhost:27018/lml_seatmaps?authSource=admin';
  
  // Test with aggressive timeouts
  const options = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    maxPoolSize: 1,
    minPoolSize: 0,
    maxIdleTimeMS: 5000,
    waitQueueTimeoutMS: 5000,
  };
  
  console.log('🔌 Creating MongoClient with options:', JSON.stringify(options, null, 2));
  
  const client = new MongoClient(uri, options);
  
  try {
    console.log('⏰ Starting connection (5s timeout)...');
    const startTime = Date.now();
    
    // Race against timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Manual timeout')), 5000))
    ]);
    
    const connectTime = Date.now() - startTime;
    console.log(`✅ Connected in ${connectTime}ms`);
    
    console.log('🗄️ Getting database...');
    const db = client.db('lml_seatmaps');
    
    console.log('📋 Getting test collection...');
    const collection = db.collection('external_test');
    
    console.log('✏️ Testing insertOne...');
    const insertResult = await collection.insertOne({
      test: true,
      timestamp: new Date(),
      message: 'External Node.js driver test'
    });
    
    console.log(`✅ Document inserted: ${insertResult.insertedId}`);
    
    console.log('🔍 Testing findOne...');
    const doc = await collection.findOne({ _id: insertResult.insertedId });
    
    console.log('✅ Document retrieved:', doc);
    
    console.log('🧹 Cleaning up...');
    await collection.deleteOne({ _id: insertResult.insertedId });
    
    console.log('✅ ALL TESTS PASSED - Node.js driver working!');
    
  } catch (error) {
    console.error('❌ EXTERNAL TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('🔌 Closing connection...');
    await client.close();
    console.log('✅ Connection closed');
  }
}

// Run the test
testMongoConnection()
  .then(() => {
    console.log('🎉 External test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 External test crashed:', error);
    process.exit(1);
  });