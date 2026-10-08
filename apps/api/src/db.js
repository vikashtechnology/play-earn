import pg from 'pg';

import { config } from './config.js';

const { Pool } = pg;

// Neon requires TLS. Connection strings from the Neon console include
// `sslmode=require`; make the intent explicit so certificate verification is on
// regardless of driver defaults, and so local Docker Postgres keeps working.
export function resolveSslSetting(connectionString) {
  if (typeof connectionString !== 'string') {
    return undefined;
  }

  const sslMode = connectionString.match(/[?&]sslmode=([a-z-]+)/i)?.[1]?.toLowerCase();
  const isNeonHost = /(^|@)[^/@]*\.neon\.tech([:/]|$)/i.test(connectionString);

  if (sslMode === 'disable') {
    return undefined;
  }
  if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full' || isNeonHost) {
    return { rejectUnauthorized: true };
  }

  return undefined;
}

function createPool(connectionString) {
  const ssl = resolveSslSetting(connectionString);

  return new Pool({
    connectionString,
    ...(ssl ? { ssl } : {}),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool = createPool(config.postgresUrl);

export async function verifyDatabaseConnection() {
  await pool.query('SELECT 1');
}
