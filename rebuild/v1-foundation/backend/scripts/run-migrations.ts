#!/usr/bin/env tsx
/*
 * Simple SQL migrator that applies files in src/db/migrations lexically, records state,
 * supports CREATE INDEX CONCURRENTLY by executing each file in its own transaction boundary.
 */
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import crypto from 'crypto';

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/db/migrations');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function ensureMigrationsTable() {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    checksum TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

type Applied = { filename: string; checksum: string | null };
async function getApplied(): Promise<Map<string, Applied>> {
  const rows = await sql`SELECT filename, checksum FROM _migrations ORDER BY id` as any;
  const map = new Map<string, Applied>();
  rows.forEach((r: any) => map.set(r.filename, { filename: r.filename, checksum: r.checksum }));
  return map;
}

function readMigrationFiles(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  // Apply from baseline (default 009_*)
  const baseline = process.env.MIGRATIONS_BASELINE_PREFIX || '009';
  return files.filter(f => {
    const m = f.match(/^(\d{3})_/);
    if (!m) return false;
    return m[1] >= baseline;
  });
}

function preprocess(sqlText: string) {
  const concurrent = process.env.MIGRATE_CONCURRENT_INDEX === 'true';
  let text = sqlText;
  if (!concurrent) {
    // Drop CONCURRENTLY for CI/local
    text = text.replace(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY/gi, 'CREATE UNIQUE INDEX');
  } else {
    // Add CONCURRENTLY in production for unique indexes lacking it
    text = text.replace(/CREATE\s+UNIQUE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?/gi, (m) => {
      // If CONCURRENTLY is already present, keep as-is
      if (/CONCURRENTLY/i.test(m)) return m;
      return m.replace(/CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX CONCURRENTLY ');
    });
  }
  return text;
}

function splitStatements(sqlText: string): string[] {
  // Simple splitter: split on ; at line ends, ignore inside $$ bodies (not used in our new migrations)
  const out: string[] = [];
  let current = '';
  let inDollar = false;
  const lines = sqlText.split(/\n/);
  for (const line of lines) {
    if (line.includes('$$')) {
      inDollar = !inDollar;
    }
    current += line + '\n';
    if (!inDollar && /;\s*$/.test(line)) {
      out.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length > 0) out.push(current.trim());
  return out.filter(Boolean);
}

async function applyFile(filename: string) {
  const full = path.join(MIGRATIONS_DIR, filename);
  const raw = fs.readFileSync(full, 'utf8');
  const text = preprocess(raw);
  const statements = splitStatements(text);
  // Refuse DO/CREATE FUNCTION for now to avoid splitter pitfalls
  if (/\bDO\s+\$\$/i.test(text) || /\bCREATE\s+FUNCTION\b/i.test(text)) {
    throw new Error(`Migration ${filename} contains DO/CREATE FUNCTION blocks which are not supported by this migrator.`);
  }
  const hasConcurrently = /CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY/i.test(text);
  if (hasConcurrently && process.env.MIGRATE_CONCURRENT_INDEX === 'true' && statements.length !== 1) {
    throw new Error(`Migration ${filename} contains CONCURRENTLY and multiple statements. Split into separate files.`);
  }
  await sql.unsafe("SET lock_timeout = '2s'");
  await sql.unsafe("SET statement_timeout = '30s'");
  console.log(`⏱️  Session timeouts set (lock_timeout=2s, statement_timeout=30s) for ${filename}`);
  for (const stmt of statements) {
    console.log(`➡️  ${path.basename(filename)} :: ${stmt.slice(0, 80).replace(/\s+/g,' ')}...`);
    await sql.unsafe(stmt);
  }
  const checksum = crypto.createHash('sha256').update(raw).digest('hex');
  await sql`INSERT INTO _migrations (filename, checksum) VALUES (${filename}, ${checksum})
            ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum`;
  console.log(`✅ Applied migration: ${filename}`);
}

async function main() {
  try {
    await ensureMigrationsTable();
    const applied = await getApplied();
    const files = readMigrationFiles();
    for (const f of files) {
      const full = path.join(MIGRATIONS_DIR, f);
      const raw = fs.readFileSync(full, 'utf8');
      const checksum = crypto.createHash('sha256').update(raw).digest('hex');
      const prev = applied.get(f);
      if (prev) {
        if (prev.checksum && prev.checksum !== checksum) {
          throw new Error(`Drift detected for ${f}: stored checksum differs`);
        }
        console.log(`↩️  Skipping already applied: ${f}`);
        continue;
      }
      await applyFile(f);
    }
    await sql.end();
    console.log('🎉 Migrations complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    await sql.end({ timeout: 0 });
    process.exit(1);
  }
}

main();


