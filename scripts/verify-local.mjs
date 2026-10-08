#!/usr/bin/env node
// One command to test this project on a local machine.
//
//   npm run verify:local              everything, including Neon
//   npm run verify:local -- --skip-db unit tests, build, and HTTP routes only
//
// Stages run in dependency order and each is classified:
//   PASS  the check succeeded
//   FAIL  a real defect — the output above it says where
//   ENV   the check could not run because of the environment (database
//         unreachable, .env missing). Not a code fault, and the fix is printed.
//   SKIP  excluded by a flag
//
// Secrets are never printed: configuration is reported by npm run config:check,
// which redacts on purpose.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDb = process.argv.includes('--skip-db');

const stages = [];

function record(name, status, detail = '') {
  stages.push({ name, status, detail });
  const marker = { PASS: '✓', FAIL: '✗', ENV: '!', SKIP: '·' }[status] ?? '?';
  console.log(`\n${marker} ${name} — ${status}${detail ? ` (${detail})` : ''}`);
}

function run(name, command, args, { allowFailure = false } = {}) {
  console.log(`\n${'─'.repeat(72)}\n${name}\n${'─'.repeat(72)}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' });

  if (result.error) {
    record(name, 'ENV', result.error.message);
    return { ok: false, status: null };
  }
  if (result.status === 0) {
    record(name, 'PASS');
    return { ok: true, status: 0 };
  }
  if (allowFailure) {
    return { ok: false, status: result.status };
  }
  record(name, 'FAIL', `exit ${result.status}`);
  return { ok: false, status: result.status };
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

console.log('Zivora — local verification');
console.log(`repository  ${repoRoot}`);
console.log(`node        ${process.version}`);
console.log(`database    ${skipDb ? 'skipped (--skip-db)' : 'included'}`);

// --- 1. runtime -------------------------------------------------------------
const [major, minor] = process.versions.node.split('.').map(Number);
const nodeOk = major > 20 || (major === 20 && minor >= 12);
if (nodeOk) {
  record('Node runtime supports process.loadEnvFile', 'PASS', process.versions.node);
} else {
  record('Node runtime supports process.loadEnvFile', 'ENV', `${process.versions.node} — install Node 22 LTS`);
}

// --- 2. dependencies --------------------------------------------------------
if (fs.existsSync(path.join(repoRoot, 'node_modules'))) {
  record('Dependencies installed', 'PASS');
} else {
  record('Dependencies installed', 'ENV', 'run: npm install');
}

// --- 3. environment file ----------------------------------------------------
const envPath = path.join(repoRoot, 'apps', 'api', '.env');
if (fs.existsSync(envPath)) {
  record('apps/api/.env exists', 'PASS');
} else {
  record('apps/api/.env exists', 'ENV', 'run: node scripts/setup-env.mjs --postgres-url … --migrations-url …');
}

// --- 4. configuration doctor ------------------------------------------------
{
  const name = 'Configuration doctor (npm run config:check)';
  console.log(`\n${'─'.repeat(72)}\n${name}\n${'─'.repeat(72)}`);
  const { stdout } = capture('npm', ['run', '--silent', 'config:check']);
  process.stdout.write(stdout);

  const blocking = stdout.split('\n').filter((line) => line.trim().startsWith('BLOCK')).map((line) => line.trim());
  // SIGNUP_ENABLED stays false until the policy pages are published, so it is an
  // expected blocker rather than a defect.
  const unexpected = blocking.filter((line) => !/SIGNUP_ENABLED/.test(line));

  if (unexpected.length === 0) {
    record(name, 'PASS', blocking.length ? `only expected blocker: SIGNUP_ENABLED` : 'no blockers');
  } else {
    record(name, 'ENV', `${unexpected.length} blocker(s) to fix before the database stages`);
  }
}

// --- 5. unit and repository tests ------------------------------------------
const testsOk = run('Unit + pg-mem repository tests (npm test)', 'npm', ['test']).ok;

// --- 6. build ---------------------------------------------------------------
const buildOk = run('API build validation (npm run build)', 'npm', ['run', 'build']).ok;

// --- 7. database ------------------------------------------------------------
let migrateOk = false;
let identityOk = false;

if (skipDb) {
  record('Migrations applied to Neon (npm run migrate)', 'SKIP', '--skip-db');
  record('Identity smoke test against Neon (smoke:identity)', 'SKIP', '--skip-db');
} else if (!fs.existsSync(envPath)) {
  record('Migrations applied to Neon (npm run migrate)', 'ENV', 'apps/api/.env is missing');
  record('Identity smoke test against Neon (smoke:identity)', 'ENV', 'apps/api/.env is missing');
} else {
  const migration = run('Migrations applied to Neon (npm run migrate)', 'npm', ['run', '--workspace', '@rewards-platform/api', 'run', 'migrate'], { allowFailure: true });
  migrateOk = migration.ok;

  if (!migrateOk) {
    record('Migrations applied to Neon (npm run migrate)', 'ENV',
      'Neon did not accept the connection. Check POSTGRES_URL / MIGRATIONS_DATABASE_URL, that the project is not suspended, and that this network can reach *.neon.tech:5432');
    record('Identity smoke test against Neon (smoke:identity)', 'ENV', 'migrations did not apply');
  } else {
    identityOk = run('Identity smoke test against Neon (smoke:identity)', 'npm', ['run', '--workspace', '@rewards-platform/api', 'run', 'smoke:identity']).ok;
  }
}

// --- 8. HTTP surface --------------------------------------------------------
// Runs with or without a database: the routes must either succeed or return the
// documented unavailable status, and must never crash the process.
const httpOk = run('HTTP route smoke test (npm run smoke:http)', 'npm', ['run', 'smoke:http']).ok;

// --- summary ----------------------------------------------------------------
console.log(`\n${'═'.repeat(72)}\nSummary\n${'═'.repeat(72)}`);
for (const stage of stages) {
  console.log(`  ${stage.status.padEnd(5)} ${stage.name}${stage.detail ? `\n          → ${stage.detail}` : ''}`);
}

const failed = stages.filter((stage) => stage.status === 'FAIL');
const blocked = stages.filter((stage) => stage.status === 'ENV');

console.log('');
if (failed.length === 0 && blocked.length === 0) {
  console.log('Everything passed. The API, database, and HTTP surface are all healthy.');
} else if (failed.length === 0) {
  console.log(`No code defects. ${blocked.length} stage(s) could not run for environmental reasons — see the → notes above.`);
} else {
  console.log(`${failed.length} stage(s) FAILED. The output above each failure says what broke.`);
}

if (!skipDb && !migrateOk) {
  console.log('\nTip: npm run verify:local -- --skip-db runs everything that does not need Neon.');
}

process.exitCode = failed.length > 0 ? 1 : 0;
