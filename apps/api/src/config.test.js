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
    // Ignore apps/api/.env so a developer's real configuration cannot leak in.
    env: { ...process.env, ...env, CONFIG_SKIP_ENV_FILE: '1' },
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

function readHelpers(env) {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { config, isPlaceholderValue, isPublishedPolicyUrl } from './src/config.js';"
    + ' console.log(JSON.stringify({ policiesPublished: config.policiesPublished, firebaseProjectId: config.firebaseProjectId,'
    + ' googleWebClientId: config.googleWebClientId }));',
  ], {
    cwd: apiRoot,
    encoding: 'utf8',
    // Ignore apps/api/.env so a developer's real configuration cannot leak in.
    env: { ...process.env, ...env, CONFIG_SKIP_ENV_FILE: '1' },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('example placeholders collapse to empty so they cannot enable a feature', () => {
  const values = readHelpers({
    FIREBASE_PROJECT_ID: 'your-firebase-project-id',
    GOOGLE_WEB_CLIENT_ID: 'configure-google-oauth-web-client-id',
  });

  assert.equal(values.firebaseProjectId, '');
  assert.equal(values.googleWebClientId, '');
});

test('policy pages on reserved or example hosts count as unpublished', () => {
  const unpublished = [
    '',
    'https://your-domain.example/terms',
    'https://playearn.example/terms',
    'https://example.com/terms',
    'http://playearn.in/terms',
    'https://localhost/terms',
    'https://playearn.invalid/terms',
    'not a url',
  ];
  for (const url of unpublished) {
    const values = readHelpers({ TERMS_URL: url, PRIVACY_URL: 'https://playearn.in/privacy' });
    assert.equal(values.policiesPublished, false, `${url || '(empty)'} must not count as published`);
  }

  const published = readHelpers({
    TERMS_URL: 'https://playearn.in/terms',
    PRIVACY_URL: 'https://playearn.in/privacy',
  });
  assert.equal(published.policiesPublished, true);
});

test('placeholder and policy-url helpers are exported for the config doctor', async () => {
  const { isPlaceholderValue, isPublishedPolicyUrl } = await import('./config.js');

  assert.equal(isPlaceholderValue('replace-with-a-long-random-secret'), true);
  assert.equal(isPlaceholderValue('your-firebase-project-id'), true);
  assert.equal(isPlaceholderValue('configure-after-fast2sms-and-DLT-approval'), true);
  assert.equal(isPlaceholderValue(''), true);
  assert.equal(isPlaceholderValue('play-earn-prod'), false);
  assert.equal(isPublishedPolicyUrl('https://playearn.in/terms'), true);
  assert.equal(isPublishedPolicyUrl('https://playearn.example/terms'), false);
});
