import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root so validator sees real values during tests (override parent env)
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: true });

// Required envs with sane fallbacks; do NOT override .env values
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/lml_test';
// Ensure scheme satisfies validator even if parent env used postgres://
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres://')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
}
if (!process.env.MONGODB_URI) process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017';
if (!process.env.MONGODB_DB) process.env.MONGODB_DB = 'lml_test';
if (!process.env.REDIS_URL) process.env.REDIS_URL = 'redis://127.0.0.1:6379';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) process.env.JWT_SECRET = 'x'.repeat(64);
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

