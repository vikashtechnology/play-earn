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

// Infrastructure failures arrive in several shapes: a socket error from the
// driver, a Postgres server-side SQLSTATE, or a pool timeout. None of them are
// the caller's fault, all of them are retryable, and none of them may be echoed
// back to a client — a driver message can name hosts, ports, and pool state.
const DATABASE_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNABORTED',
  '08001', '08004', '08006', '53300', '57P01', '57P02', '57P03', '58030',
]);

const DATABASE_UNAVAILABLE_PATTERNS = [
  /connection terminated unexpectedly/i,
  /timeout expired when trying to connect/i,
  /client has already been destroyed/i,
  /connection to the server was lost/i,
  /too many connections/i,
  /remaining connection slots are reserved/i,
];

export function isDatabaseUnavailableError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if (typeof error.code === 'string' && DATABASE_UNAVAILABLE_CODES.has(error.code)) {
    return true;
  }
  const message = typeof error.message === 'string' ? error.message : '';
  return DATABASE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message));
}
