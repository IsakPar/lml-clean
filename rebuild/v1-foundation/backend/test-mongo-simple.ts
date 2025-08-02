/**
 * Simple MongoDB Test Runner
 * ==========================
 * Tests MongoDB service using installed dependencies
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';

// Simple test result interface
interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class SimpleMongoTestRunner {
  private mongoServer?: MongoMemoryServer;
  private mongoClient?: MongoClient;
  private database?: Db;
  private results: TestResult[] = [];

  async setup(): Promise<void> {
    console.log('🚀 Setting up MongoDB test environment...');
    
    this.mongoServer = await MongoMemoryServer.create();
    const uri = this.mongoServer.getUri();
    this.mongoClient = new MongoClient(uri);
    await this.mongoClient.connect();
    this.database = this.mongoClient.db('test-validation');
    
    console.log('✅ Test environment ready');
  }

  async cleanup(): Promise<void> {
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`🧪 Running: ${name}`);
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, success: true, duration });
      console.log(`  ✅ ${name} passed (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({ 
        name, 
        success: false, 
        duration, 
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`  ❌ ${name} failed (${duration}ms): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async testBasicConnection(): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');
    await this.database.admin().ping();
  }

  async testCreateCollection(): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');
    const collection = this.database.collection('test_layouts');
    await collection.insertOne({ 
      name: 'test-layout',
      created_at: new Date(),
      status: 'draft'
    });
    const count = await collection.countDocuments();
    if (count !== 1) throw new Error('Failed to create document');
  }

  async testQueryCollection(): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');
    const collection = this.database.collection('test_layouts');
    const doc = await collection.findOne({ name: 'test-layout' });
    if (!doc) throw new Error('Failed to find document');
    if (doc.name !== 'test-layout') throw new Error('Document data mismatch');
  }

  async testIndexCreation(): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');
    const collection = this.database.collection('test_layouts');
    await collection.createIndex({ name: 1 }, { unique: true });
    const indexes = await collection.indexes();
    const hasNameIndex = indexes.some(idx => idx.key && idx.key.name === 1);
    if (!hasNameIndex) throw new Error('Failed to create index');
  }

  getResults() {
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    return {
      results: this.results,
      passed,
      failed,
      total: this.results.length
    };
  }
}

async function runTests(): Promise<void> {
  const runner = new SimpleMongoTestRunner();
  
  try {
    await runner.setup();
    
    console.log('\n📋 Running MongoDB Basic Tests...\n');
    
    // Basic tests
    await runner.runTest('Basic Connection', () => runner.testBasicConnection());
    await runner.runTest('Create Collection', () => runner.testCreateCollection());
    await runner.runTest('Query Collection', () => runner.testQueryCollection());
    await runner.runTest('Index Creation', () => runner.testIndexCreation());
    
    // Results summary
    const results = runner.getResults();
    
    console.log('\n📊 Test Results Summary:');
    console.log(`   Passed: ${results.passed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Total:  ${results.total}`);
    
    if (results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   - ${r.name}: ${r.error}`);
        });
    }
    
    console.log(`\n${results.failed === 0 ? '🎉' : '⚠️'} MongoDB basic tests ${results.failed === 0 ? 'completed successfully' : 'completed with failures'}`);
    
    if (results.failed === 0) {
      console.log('\n✨ MongoDB service is working correctly!');
      console.log('✨ Ready to enable venue layout APIs!');
    }
    
  } catch (error) {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
    
  } finally {
    await runner.cleanup();
  }
}

// Run tests
runTests().catch(console.error);