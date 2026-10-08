#!/usr/bin/env node
// Creates apps/api/.env for a local machine.
//
// apps/api/.env is git-ignored, so it never travels with the repository: every
// developer and every deploy has to create it. This removes the error-prone
// parts by deriving what can be derived and generating what must be secret.
//
//   - Firebase values are read from the committed apps/android/app/google-services.json
//     (public identifiers by design — they ship inside the APK).
//   - JWT_SECRET and OTP_HASH_SECRET are generated locally with 256 bits of
//     entropy and are never printed.
//   - Neon connection strings must be supplied, because only you can read them
//     from the Neon console.
//
// Usage:
//   node scripts/setup-env.mjs --postgres-url "postgresql://..." --migrations-url "postgresql://..."
//   node scripts/setup-env.mjs --force          # rewrite an existing .env
//
// Nothing here contacts the network, and no secret value is written to stdout.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, 'apps', 'api', '.env');
const examplePath = path.join(repoRoot, 'apps', 'api', '.env.example');
const googleServicesPath = path.join(repoRoot, 'apps', 'android', 'app', 'google-services.json');

function parseArgs(argv) {
  const args = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--force') args.force = true;
    else if (token === '--postgres-url') args.postgresUrl = argv[index += 1];
    else if (token === '--migrations-url') args.migrationsUrl = argv[index += 1];
    else if (token === '--support-email') args.supportEmail = argv[index += 1];
    else if (token === '--help' || token === '-h') args.help = true;
    else {
      console.error(`Unknown argument: ${token}`);
      process.exitCode = 2;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Create apps/api/.env for local development.

  --postgres-url URL      Neon pooled connection string (console -> Connect -> Pooled)
  --migrations-url URL    Neon direct connection string (console -> Connect, unpooled)
  --support-email ADDR    Address shown in the app and required by the Play listing
  --force                 Overwrite an existing apps/api/.env

Falls back to the POSTGRES_URL and MIGRATIONS_DATABASE_URL environment variables
when the flags are omitted.`);
  process.exit(0);
}

if (fs.existsSync(envPath) && !args.force) {
  console.error(`apps/api/.env already exists. Re-run with --force to overwrite it.`);
  process.exit(1);
}

if (!fs.existsSync(examplePath)) {
  console.error('apps/api/.env.example is missing; cannot build a template.');
  process.exit(1);
}

// --- Firebase identifiers, read from the committed Android config -------------
const warnings = [];
const firebase = { projectId: '', webApiKey: '', googleWebClientId: '' };

if (fs.existsSync(googleServicesPath)) {
  try {
    const services = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
    firebase.projectId = services.project_info?.project_id ?? '';
    firebase.webApiKey = services.client?.[0]?.api_key?.[0]?.current_key ?? '';
    const webClient = services.client?.[0]?.oauth_client?.find((entry) => entry.client_type === 3);
    firebase.googleWebClientId = webClient?.client_id ?? '';

    if (!firebase.googleWebClientId) warnings.push('no client_type 3 (web) OAuth client in google-services.json — Google sign-in will stay disabled');
  } catch (error) {
    warnings.push(`google-services.json could not be parsed: ${error.message}`);
  }
} else {
  warnings.push('apps/android/app/google-services.json is missing — Firebase values left as placeholders');
}

// --- connection strings ------------------------------------------------------
const postgresUrl = args.postgresUrl ?? process.env.POSTGRES_URL ?? '';
const migrationsUrl = args.migrationsUrl ?? process.env.MIGRATIONS_DATABASE_URL ?? '';

if (!postgresUrl) warnings.push('POSTGRES_URL not supplied: pass --postgres-url from the Neon console (Connect -> Pooled)');
if (!migrationsUrl) warnings.push('MIGRATIONS_DATABASE_URL not supplied: pass --migrations-url from the Neon console (Connect, unpooled)');
for (const [label, value] of [['POSTGRES_URL', postgresUrl], ['MIGRATIONS_DATABASE_URL', migrationsUrl]]) {
  if (value && !/[?&]sslmode=require/.test(value)) {
    warnings.push(`${label} has no sslmode=require — Neon requires TLS`);
  }
}

// --- generated secrets, never printed ---------------------------------------
const jwtSecret = randomBytes(32).toString('hex');
const otpHashSecret = randomBytes(32).toString('hex');

// --- apply ------------------------------------------------------------------
let contents = fs.readFileSync(examplePath, 'utf8');
const applied = [];
const skipped = [];

function set(key, value, { redact = false, note = '' } = {}) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!value) {
    skipped.push(`${key}${note ? ` — ${note}` : ''}`);
    return;
  }
  if (!pattern.test(contents)) {
    contents += `\n${key}=${value}\n`;
  } else {
    contents = contents.replace(pattern, `${key}=${value}`);
  }
  applied.push(`${key}=${redact ? '(generated, not shown)' : value}`);
}

set('POSTGRES_URL', postgresUrl, { note: 'pooled Neon URL' });
set('MIGRATIONS_DATABASE_URL', migrationsUrl, { note: 'direct Neon URL' });
set('JWT_SECRET', jwtSecret, { redact: true });
set('OTP_HASH_SECRET', otpHashSecret, { redact: true });
set('AUTH_PROVIDER', 'firebase');
set('FIREBASE_AUTH_ENABLED', 'true');
set('FIREBASE_PROJECT_ID', firebase.projectId, { note: 'from google-services.json' });
set('FIREBASE_WEB_API_KEY', firebase.webApiKey, { note: 'optional; only for read-only Identity Toolkit lookups' });
set('FIREBASE_ALLOWED_SIGN_IN_PROVIDERS', 'emailLink,google.com');
set('GOOGLE_SIGNIN_ENABLED', firebase.googleWebClientId ? 'true' : 'false');
set('GOOGLE_WEB_CLIENT_ID', firebase.googleWebClientId, { note: 'no web OAuth client found' });
set('SUPPORT_EMAIL', args.supportEmail ?? '', { note: 'pass --support-email; required for the Play listing' });

// The drafted legal pages in site/. They only count once published, and
// SIGNUP_ENABLED stays false until then.
set('TERMS_VERSION', 'terms-2026-10-08.2');
set('PRIVACY_VERSION', 'privacy-2026-10-08.2');
set('TERMS_URL', 'https://vikashtechnology.github.io/play-earn/terms.html');
set('PRIVACY_URL', 'https://vikashtechnology.github.io/play-earn/privacy.html');
set('ACCOUNT_DELETION_URL', 'https://vikashtechnology.github.io/play-earn/delete-account.html');
set('SIGNUP_ENABLED', 'false');

fs.writeFileSync(envPath, contents, { mode: 0o600 });
// writeFileSync only applies `mode` when it creates the file, so an overwritten
// .env would keep its old permissions. A file holding database credentials and
// signing secrets must not be world-readable.
fs.chmodSync(envPath, 0o600);

console.log('\nCreated apps/api/.env (mode 600, git-ignored)\n');
console.log('Set:');
for (const line of applied) console.log(`  ✓ ${line}`);

if (skipped.length > 0) {
  console.log('\nLeft as placeholders:');
  for (const line of skipped) console.log(`  · ${line}`);
}

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const line of warnings) console.log(`  ! ${line}`);
}

console.log(`
Next:
  npm run config:check     confirm what is still blocking
  npm run verify:local     run the whole local gauntlet
  npm run db:verify        apply migrations to Neon and smoke-test identity

SIGNUP_ENABLED is false on purpose: sign-in stays closed until the policy pages
in site/ are published, their bracketed placeholders are filled, and the URLs
above actually load. See docs/11_Local_Testing.md.`);
