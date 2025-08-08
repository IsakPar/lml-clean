process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/lml_test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
process.env.MONGODB_DB = process.env.MONGODB_DB || 'lml_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(64);
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

