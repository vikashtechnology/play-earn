import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config.js';
import { resolveSslSetting } from '../src/db.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(rootDir, 'migrations');
const connectionString = config.migrationsPostgresUrl;
const isCheckMode = process.argv.includes('--check');

function listMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function main() {
  const files = listMigrations();

  if (isCheckMode) {
    console.log(`Migration files ready: ${files.length}`);
    for (const file of files) {
      console.log(`- ${file}`);
    }
    return;
  }

  const ssl = resolveSslSetting(connectionString);
  const client = new Client({ connectionString, ...(ssl ? { ssl } : {}) });

  try {
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const migrationName = file;
      const result = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [migrationName]);

      if (result.rowCount > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migrationName]);
      console.log(`Applied migration: ${migrationName}`);
    }

    console.log(`Migrations complete. Total applied: ${files.length}`);
  } catch (error) {
    console.error('Neon PostgreSQL is not available. Set MIGRATIONS_DATABASE_URL to the Neon direct (non-pooled) connection string with sslmode=require, or start local Postgres and set POSTGRES_URL.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
