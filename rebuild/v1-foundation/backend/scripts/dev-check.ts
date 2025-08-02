#!/usr/bin/env tsx
/**
 * LML v1 Foundation - Development Environment Checker
 * ===================================================
 * Comprehensive validation of development environment setup
 * Created: 2025-08-01
 * Status: Phase 1 Hardening
 */

import { validateEnvironment, logEnvironmentStatus } from '../src/lib/env';
import { validateConfiguration } from '../src/lib/config';
import { validateAuthConfig, logAuthStatus } from '../src/lib/auth';
import { checkPostgresHealth } from '../src/lib/db/postgres';
import { checkMongoDBHealth } from '../src/lib/db/mongodb';
import { checkRedisHealth } from '../src/lib/db/redis';

// ================================================
// DEVELOPMENT CHECKER
// ================================================

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string[];
  timing?: number;
}

class DevChecker {
  private results: CheckResult[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Run all development environment checks
   */
  async runAllChecks(): Promise<void> {
    console.log('🔍 LML v1 Foundation - Development Environment Check');
    console.log('=' .repeat(60));
    console.log();

    // Environment validation
    await this.checkEnvironmentVariables();
    
    // Configuration validation
    await this.checkConfiguration();
    
    // Database connections
    await this.checkDatabaseConnections();
    
    // Authentication setup
    await this.checkAuthenticationSetup();
    
    // File structure
    await this.checkFileStructure();
    
    // Dependencies
    await this.checkDependencies();
    
    // Summary
    this.printSummary();
  }

  /**
   * Check environment variables
   */
  private async checkEnvironmentVariables(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🌍 Checking Environment Variables...');
      
      const env = validateEnvironment();
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'Environment Variables',
        status: 'pass',
        message: `All required environment variables present (${env.NODE_ENV})`,
        timing,
      });
      
      console.log('   ✅ Environment validation passed');
      console.log(`   📊 Environment: ${env.NODE_ENV}`);
      console.log(`   🔧 Log Level: ${env.LOG_LEVEL}`);
      console.log();
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'Environment Variables',
        status: 'fail',
        message: 'Environment validation failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ Environment validation failed');
      console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log();
    }
  }

  /**
   * Check configuration setup
   */
  private async checkConfiguration(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('⚙️ Checking Configuration...');
      
      const config = validateConfiguration();
      const timing = Date.now() - startTime;
      
      if (config.valid) {
        this.results.push({
          name: 'Configuration',
          status: 'pass',
          message: 'Configuration validation passed',
          details: config.warnings.length > 0 ? config.warnings : undefined,
          timing,
        });
        
        console.log('   ✅ Configuration is valid');
        if (config.warnings.length > 0) {
          console.log('   ⚠️ Warnings:');
          config.warnings.forEach(warning => {
            console.log(`      • ${warning}`);
          });
        }
      } else {
        this.results.push({
          name: 'Configuration',
          status: 'fail',
          message: 'Configuration validation failed',
          details: config.errors,
          timing,
        });
        
        console.log('   ❌ Configuration errors:');
        config.errors.forEach(error => {
          console.log(`      • ${error}`);
        });
      }
      console.log();
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'Configuration',
        status: 'fail',
        message: 'Configuration check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ Configuration check failed');
      console.log();
    }
  }

  /**
   * Check database connections
   */
  private async checkDatabaseConnections(): Promise<void> {
    console.log('🗄️ Checking Database Connections...');
    
    // PostgreSQL
    await this.checkPostgreSQL();
    
    // MongoDB
    await this.checkMongoDB();
    
    // Redis
    await this.checkRedis();
    
    console.log();
  }

  private async checkPostgreSQL(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const health = await checkPostgresHealth();
      const timing = Date.now() - startTime;
      
      if (health.status === 'connected') {
        this.results.push({
          name: 'PostgreSQL',
          status: 'pass',
          message: `Connected (${health.responseTime}ms)`,
          timing,
        });
        
        console.log(`   ✅ PostgreSQL: Connected (${health.responseTime}ms)`);
      } else {
        this.results.push({
          name: 'PostgreSQL',
          status: 'fail',
          message: 'Connection failed',
          details: [health.error || 'Unknown error'],
          timing,
        });
        
        console.log(`   ❌ PostgreSQL: ${health.error}`);
      }
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'PostgreSQL',
        status: 'fail',
        message: 'Connection check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ PostgreSQL: Connection check failed');
    }
  }

  private async checkMongoDB(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const health = await checkMongoDBHealth();
      const timing = Date.now() - startTime;
      
      if (health.status === 'connected') {
        this.results.push({
          name: 'MongoDB',
          status: 'pass',
          message: `Connected (${health.responseTime}ms)`,
          timing,
        });
        
        console.log(`   ✅ MongoDB: Connected (${health.responseTime}ms)`);
      } else {
        this.results.push({
          name: 'MongoDB',
          status: 'fail',
          message: 'Connection failed',
          details: [health.error || 'Unknown error'],
          timing,
        });
        
        console.log(`   ❌ MongoDB: ${health.error}`);
      }
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'MongoDB',
        status: 'fail',
        message: 'Connection check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ MongoDB: Connection check failed');
    }
  }

  private async checkRedis(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const health = await checkRedisHealth();
      const timing = Date.now() - startTime;
      
      if (health.status === 'connected') {
        this.results.push({
          name: 'Redis',
          status: 'pass',
          message: `Connected (${health.responseTime}ms)`,
          timing,
        });
        
        console.log(`   ✅ Redis: Connected (${health.responseTime}ms)`);
      } else {
        this.results.push({
          name: 'Redis',
          status: 'fail',
          message: 'Connection failed',
          details: [health.error || 'Unknown error'],
          timing,
        });
        
        console.log(`   ❌ Redis: ${health.error}`);
      }
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'Redis',
        status: 'fail',
        message: 'Connection check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ Redis: Connection check failed');
    }
  }

  /**
   * Check authentication setup
   */
  private async checkAuthenticationSetup(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('🔒 Checking Authentication Setup...');
      
      const authConfig = validateAuthConfig();
      const timing = Date.now() - startTime;
      
      if (authConfig.valid) {
        this.results.push({
          name: 'Authentication',
          status: authConfig.warnings.length > 0 ? 'warn' : 'pass',
          message: 'Authentication scaffolding ready',
          details: authConfig.warnings.length > 0 ? authConfig.warnings : undefined,
          timing,
        });
        
        console.log('   ✅ Authentication scaffolding ready');
        if (authConfig.warnings.length > 0) {
          console.log('   ⚠️ Warnings:');
          authConfig.warnings.forEach(warning => {
            console.log(`      • ${warning}`);
          });
        }
      } else {
        this.results.push({
          name: 'Authentication',
          status: 'fail',
          message: 'Authentication setup has issues',
          details: authConfig.errors,
          timing,
        });
        
        console.log('   ❌ Authentication errors:');
        authConfig.errors.forEach(error => {
          console.log(`      • ${error}`);
        });
      }
      console.log();
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'Authentication',
        status: 'fail',
        message: 'Authentication check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ Authentication check failed');
      console.log();
    }
  }

  /**
   * Check file structure
   */
  private async checkFileStructure(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('📁 Checking File Structure...');
      
      const requiredFiles = [
        'src/lib/env.ts',
        'src/lib/config.ts',
        'src/lib/db/postgres.ts',
        'src/lib/db/mongodb.ts',
        'src/lib/db/redis.ts',
        'src/lib/db/schema.ts',
        'src/lib/services/show-service.ts',
        'src/lib/services/seatmap-service.ts',
        'src/lib/utils/validation.ts',
        'src/lib/utils/seat-id-convention.ts',
        'src/lib/auth/index.ts',
        'src/lib/middleware/rateLimiter.ts',
        'src/app/api/v1/health/route.ts',
        'src/app/api/v1/shows/route.ts',
        'src/app/api/v1/shows/[id]/seatmap/route.ts',
      ];
      
      const missingFiles: string[] = [];
      
      for (const file of requiredFiles) {
        try {
          await import(`../${file}`);
        } catch (error) {
          missingFiles.push(file);
        }
      }
      
      const timing = Date.now() - startTime;
      
      if (missingFiles.length === 0) {
        this.results.push({
          name: 'File Structure',
          status: 'pass',
          message: `All ${requiredFiles.length} required files present`,
          timing,
        });
        
        console.log(`   ✅ All ${requiredFiles.length} required files present`);
      } else {
        this.results.push({
          name: 'File Structure',
          status: 'fail',
          message: `${missingFiles.length} files missing`,
          details: missingFiles,
          timing,
        });
        
        console.log(`   ❌ Missing files:`);
        missingFiles.forEach(file => {
          console.log(`      • ${file}`);
        });
      }
      console.log();
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'File Structure',
        status: 'fail',
        message: 'File structure check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ File structure check failed');
      console.log();
    }
  }

  /**
   * Check dependencies
   */
  private async checkDependencies(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('📦 Checking Dependencies...');
      
      const requiredDeps = [
        'next',
        'react',
        'drizzle-orm',
        'postgres', 
        'mongodb',
        'ioredis',
        'zod',
      ];
      
      const missingDeps: string[] = [];
      
      for (const dep of requiredDeps) {
        try {
          await import(dep);
        } catch (error) {
          missingDeps.push(dep);
        }
      }
      
      const timing = Date.now() - startTime;
      
      if (missingDeps.length === 0) {
        this.results.push({
          name: 'Dependencies',
          status: 'pass',
          message: `All ${requiredDeps.length} required dependencies available`,
          timing,
        });
        
        console.log(`   ✅ All ${requiredDeps.length} required dependencies available`);
      } else {
        this.results.push({
          name: 'Dependencies',
          status: 'fail',
          message: `${missingDeps.length} dependencies missing`,
          details: missingDeps,
          timing,
        });
        
        console.log(`   ❌ Missing dependencies:`);
        missingDeps.forEach(dep => {
          console.log(`      • ${dep}`);
        });
        console.log('   💡 Run: pnpm install');
      }
      console.log();
    } catch (error) {
      const timing = Date.now() - startTime;
      
      this.results.push({
        name: 'Dependencies',
        status: 'fail',
        message: 'Dependency check failed',
        details: [error instanceof Error ? error.message : 'Unknown error'],
        timing,
      });
      
      console.log('   ❌ Dependency check failed');
      console.log();
    }
  }

  /**
   * Print summary of all checks
   */
  private printSummary(): void {
    const totalTime = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.status === 'pass').length;
    const warned = this.results.filter(r => r.status === 'warn').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    
    console.log('📊 Summary');
    console.log('=' .repeat(60));
    
    this.results.forEach(result => {
      const icon = result.status === 'pass' ? '✅' : 
                   result.status === 'warn' ? '⚠️' : '❌';
      const timing = result.timing ? ` (${result.timing}ms)` : '';
      
      console.log(`${icon} ${result.name}: ${result.message}${timing}`);
      
      if (result.details) {
        result.details.forEach(detail => {
          console.log(`   • ${detail}`);
        });
      }
    });
    
    console.log();
    console.log('📈 Results:');
    console.log(`   ✅ Passed: ${passed}`);
    if (warned > 0) console.log(`   ⚠️ Warnings: ${warned}`);
    if (failed > 0) console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️ Total time: ${totalTime}ms`);
    
    if (failed === 0) {
      console.log();
      console.log('🎉 Development environment is ready!');
      console.log('💡 Next steps:');
      console.log('   • Start the development server: pnpm run dev');
      console.log('   • Test API endpoints: curl http://localhost:3001/api/v1/health');
      console.log('   • View API docs: /docs/api/openapi.yaml');
    } else {
      console.log();
      console.log('❌ Development environment has issues that need to be resolved.');
      console.log('💡 Fix the failed checks above before proceeding.');
    }
    
    console.log();
  }
}

// ================================================
// CLI EXECUTION
// ================================================

async function main() {
  const checker = new DevChecker();
  
  try {
    await checker.runAllChecks();
    process.exit(0);
  } catch (error) {
    console.error('❌ Development check failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DevChecker };