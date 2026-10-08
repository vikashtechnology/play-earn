import { config } from './config.js';
import { createApp } from './app.js';
import { pool, verifyDatabaseConnection } from './db.js';

const port = config.port;
const server = createApp();

async function start() {
  await verifyDatabaseConnection();

  server.listen(port, () => {
    console.log(`Rewards Platform API listening on http://localhost:${port}`);
  });
}

async function stop() {
  server.close(async () => {
    await pool.end();
  });
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start().catch(async (error) => {
  console.error('API startup failed because Neon PostgreSQL could not be reached. Check POSTGRES_URL (pooled) and MIGRATIONS_DATABASE_URL (direct).');
  console.error(error instanceof Error ? error.message : String(error));
  await pool.end();
  process.exitCode = 1;
});
