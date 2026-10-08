import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const apiRoot = path.resolve(import.meta.dirname, '..');

function readConfig(env) {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { config, isFirebaseAuthConfigured } from './src/config.js'; console.log(JSON.stringify({ config, firebaseConfigured: isFirebaseAuthConfigured(config) }));",
  ], {
    cwd: apiRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('runtime config reads Neon URLs, Firebase Auth settings, and port from environment', () => {
  const { config, firebaseConfigured } = readConfig({
    PORT: '4317',
    NODE_ENV: 'production',
    POSTGRES_URL: 'postgresql://app:secret@ep-pool-123456-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require',
    MIGRATIONS_DATABASE_URL: 'postgresql://migrator:secret@ep-123456.ap-south-1.aws.neon.tech/neondb?sslmode=require',
    FIREBASE_AUTH_ENABLED: 'true',
    FIREBASE_PROJECT_ID: 'play-earn-prod',
    FIREBASE_WEB_API_KEY: 'public-web-api-key',
    FIREBASE_ALLOWED_SIGN_IN_PROVIDERS: 'google.com, phone.com ,emailLink',
    SIGNUP_ENABLED: 'true',
    TERMS_VERSION: 'terms-2026-10-01',
    PRIVACY_VERSION: 'privacy-2026-10-01',
    MINIMUM_USER_AGE: '18',
    SUPPORT_EMAIL: 'support@playearn.example',
    ACCOUNT_DELETION_URL: 'https://playearn.example/delete-account',
  });

  assert.equal(config.port, 4317);
  assert.equal(config.env, 'production');
  assert.equal(
    config.postgresUrl,
    'postgresql://app:secret@ep-pool-123456-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require',
  );
  assert.equal(
    config.migrationsPostgresUrl,
    'postgresql://migrator:secret@ep-123456.ap-south-1.aws.neon.tech/neondb?sslmode=require',
  );
  assert.equal(config.authProvider, 'firebase');
  assert.equal(config.firebaseAuthEnabled, true);
  assert.equal(config.firebaseProjectId, 'play-earn-prod');
  assert.deepEqual(config.firebaseAllowedSignInProviders, ['google.com', 'phone.com', 'emailLink']);
  assert.equal(config.minimumUserAge, 18);
  assert.equal(config.accountDeletionUrl, 'https://playearn.example/delete-account');
  assert.equal(firebaseConfigured, true);
});

test('config fails closed by default: no Firebase project, no signup, no OTP delivery', () => {
  const { config, firebaseConfigured } = readConfig({
    FIREBASE_AUTH_ENABLED: undefined,
    FIREBASE_PROJECT_ID: undefined,
    SIGNUP_ENABLED: undefined,
    OTP_DELIVERY_ENABLED: undefined,
    GOOGLE_SIGNIN_ENABLED: undefined,
    TERMS_VERSION: undefined,
    PRIVACY_VERSION: undefined,
  });

  assert.equal(firebaseConfigured, false);
  assert.equal(config.signupEnabled, false);
  assert.equal(config.googleSignInEnabled, false);
  assert.equal(config.otpDeliveryEnabled, false);
  assert.equal(config.termsVersion, '');
  // The default provider list must never include anonymous or custom tokens.
  assert.equal(config.firebaseAllowedSignInProviders.includes('anonymous'), false);
  assert.equal(config.firebaseAllowedSignInProviders.includes('custom'), false);
});

test('config keeps no Supabase credentials and defaults the OTP hash secret', () => {
  const { config } = readConfig({
    SUPABASE_URL: 'https://legacy.supabase.co',
    SUPABASE_ANON_KEY: 'legacy-anon-key',
    JWT_SECRET: 'jwt-secret-value',
    OTP_HASH_SECRET: undefined,
  });

  assert.equal(config.supabaseUrl, undefined);
  assert.equal(config.supabaseAnonKey, undefined);
  assert.equal(config.supabaseServiceRoleKey, undefined);
  assert.equal(JSON.stringify(config).includes('legacy-anon-key'), false);
  assert.equal(config.otpHashSecret, 'jwt-secret-value');
});
