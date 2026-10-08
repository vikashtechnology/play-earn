// Configuration doctor: validates apps/api/.env and the Android Firebase config
// without touching the network, and reports exactly which fail-closed gate is
// still blocking sign-in.
//
//   npm run config:check
//
// Exit code 0 = ready for Firebase sign-in, 1 = something blocking remains.
// The gate helpers are imported from the auth route itself, so this script can
// never disagree with what the API actually enforces.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { config, isFirebaseAuthConfigured, isPlaceholderValue, isPublishedPolicyUrl } from '../src/config.js';
import {
  hasPublishedPolicies,
  isFirebasePhoneVerificationEnabled,
  isFirebaseSignInEnabled,
} from '../src/routes/auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');
const envPath = path.join(apiRoot, '.env');
const googleServicesPath = path.join(repoRoot, 'apps', 'android', 'app', 'google-services.json');

const ANDROID_PACKAGE = 'com.rewardsplatform.app';
const PLACEHOLDER_VALUES = new Set([
  '',
  'REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID',
  'REPLACE_WITH_YOUR_FIREBASE_WEB_API_KEY',
  'replace-with-a-long-random-secret',
  'replace-with-a-different-long-random-secret',
  'development-secret-change-me',
  'configure-google-oauth-web-client-id',
  'publish-reviewed-terms-version',
  'publish-reviewed-privacy-version',
  'configure-after-fast2sms-and-DLT-approval',
]);

const results = { blocking: [], warning: [], ok: [] };

function ok(message) {
  results.ok.push(message);
}
function warn(message, fix) {
  results.warning.push({ message, fix });
}
function block(message, fix) {
  results.blocking.push({ message, fix });
}
// Same predicate the API uses, plus the .env.example literals it does not know.
function isPlaceholder(value) {
  return isPlaceholderValue(value) || PLACEHOLDER_VALUES.has(String(value ?? '').trim());
}

// ---------------------------------------------------------------- Node runtime
function checkRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  // src/config.js uses process.loadEnvFile, added in Node 20.12.
  if (major > 20 || (major === 20 && minor >= 12)) {
    ok(`Node ${process.versions.node} supports process.loadEnvFile`);
  } else {
    block(`Node ${process.versions.node} is too old for process.loadEnvFile`, 'Use Node 20.12+ (22 LTS recommended).');
  }

  if (fs.existsSync(envPath)) {
    ok('apps/api/.env exists and was loaded');
  } else {
    block('apps/api/.env is missing', 'cp apps/api/.env.example apps/api/.env, then fill in the values.');
  }
}

// ---------------------------------------------------------------------- Neon
function checkDatabaseUrl(label, value, { pooled }) {
  if (isPlaceholder(value) || !value) {
    block(`${label} is not set`, `Paste the ${pooled ? 'pooled' : 'direct'} Neon connection string.`);
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    const stillExample = value.includes('YOUR-ENDPOINT') || value.includes('<region>');
    block(
      stillExample ? `${label} is still the .env.example value` : `${label} is not a parseable connection string`,
      stillExample
        ? `Paste the ${pooled ? 'pooled' : 'direct'} string from the Neon console (Connect).`
        : 'Check for unencoded special characters in the password.',
    );
    return null;
  }

  const problems = [];
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    problems.push('protocol must be postgresql://');
  }
  if (!url.hostname.endsWith('neon.tech')) {
    problems.push(`host "${url.hostname}" is not a Neon endpoint`);
  }
  const isPooledHost = url.hostname.includes('-pooler.');
  if (pooled && !isPooledHost) {
    problems.push('expected the pooled endpoint (host contains "-pooler.")');
  }
  if (!pooled && isPooledHost) {
    problems.push('migrations must use the direct endpoint (host without "-pooler.")');
  }
  if (url.searchParams.get('sslmode') !== 'require') {
    problems.push('must end with ?sslmode=require');
  }
  if (!url.username || !url.password) {
    problems.push('missing role or password');
  }
  if (/^(USER|PASSWORD|your-)/i.test(url.username) || /^(USER|PASSWORD|your-)/i.test(url.password)) {
    problems.push('still contains example credentials');
  }

  if (problems.length > 0) {
    block(`${label}: ${problems.join('; ')}`, 'Compare against the Pooled and Direct strings in the Neon console (Connect).');
    return url;
  }

  ok(`${label} → ${url.hostname}/${url.pathname.slice(1)} (pooled=${isPooledHost}, sslmode=require)`);
  return url;
}

function checkNeon() {
  const pooled = checkDatabaseUrl('POSTGRES_URL', config.postgresUrl, { pooled: true });
  const direct = checkDatabaseUrl(
    'MIGRATIONS_DATABASE_URL',
    process.env.MIGRATIONS_DATABASE_URL ?? '',
    { pooled: false },
  );

  if (pooled && direct && pooled.hostname === direct.hostname) {
    block(
      'POSTGRES_URL and MIGRATIONS_DATABASE_URL point at the same endpoint',
      'The API needs the pooled endpoint; migrations need the direct one. DDL through PgBouncer can fail.',
    );
  }
  if (!process.env.MIGRATIONS_DATABASE_URL) {
    warn(
      'MIGRATIONS_DATABASE_URL is unset, so migrations fall back to POSTGRES_URL',
      'Set the direct (non-pooler) connection string before running `npm --workspace @rewards-platform/api run migrate`.',
    );
  }
}

// -------------------------------------------------------------------- Secrets
function checkSecrets() {
  const jwt = process.env.JWT_SECRET ?? '';
  if (isPlaceholder(jwt)) {
    block('JWT_SECRET is still the development placeholder', 'openssl rand -hex 32');
  } else if (jwt.length < 32) {
    block(`JWT_SECRET is only ${jwt.length} characters`, 'Use at least 32 characters (openssl rand -hex 32).');
  } else {
    ok(`JWT_SECRET is set (${jwt.length} characters)`);
  }

  const otp = process.env.OTP_HASH_SECRET ?? '';
  if (isPlaceholder(otp)) {
    if (config.otpDeliveryEnabled) {
      block('OTP_HASH_SECRET is a placeholder while OTP delivery is enabled', 'openssl rand -hex 32');
    } else {
      warn('OTP_HASH_SECRET is a placeholder', 'Only needed if the legacy Fast2SMS fallback is ever enabled.');
    }
  } else if (otp === jwt) {
    warn('OTP_HASH_SECRET is identical to JWT_SECRET', 'Use a distinct random value per purpose.');
  } else {
    ok('OTP_HASH_SECRET is set and distinct from JWT_SECRET');
  }

  if (config.otpDeliveryEnabled) {
    if (isPlaceholder(config.otpProviderApiKey)) {
      block('OTP_DELIVERY_ENABLED=true but OTP_PROVIDER_API_KEY is a placeholder', 'Set the Fast2SMS key or leave delivery disabled.');
    }
  } else {
    ok('Legacy Fast2SMS OTP delivery is disabled (Firebase phone auth is primary)');
  }
}

// ------------------------------------------------------------------- Firebase
function checkFirebase() {
  if (config.authProvider !== 'firebase') {
    block(`AUTH_PROVIDER is "${config.authProvider}"`, 'Set AUTH_PROVIDER=firebase.');
  } else {
    ok('AUTH_PROVIDER=firebase');
  }

  if (config.firebaseAuthEnabled) {
    ok('FIREBASE_AUTH_ENABLED=true');
  } else {
    block('FIREBASE_AUTH_ENABLED is not "true"', 'Set FIREBASE_AUTH_ENABLED=true once the project exists.');
  }

  if (!config.firebaseProjectId) {
    block('FIREBASE_PROJECT_ID is missing or still an example placeholder', 'Firebase console → Project settings → General → Project ID.');
  } else {
    ok(`FIREBASE_PROJECT_ID=${config.firebaseProjectId}`);
  }

  const providers = config.firebaseAllowedSignInProviders;
  const banned = providers.filter((provider) => provider === 'anonymous' || provider === 'custom');
  if (banned.length > 0) {
    block(
      `FIREBASE_ALLOWED_SIGN_IN_PROVIDERS includes ${banned.join(', ')}`,
      'Anonymous and custom tokens must never hold a wallet. Remove them.',
    );
  } else if (providers.length === 0) {
    block('FIREBASE_ALLOWED_SIGN_IN_PROVIDERS is empty', 'Use emailLink,password,google.com,phone.com.');
  } else {
    ok(`Allowed sign-in providers: ${providers.join(', ')}`);
  }

  if (isPlaceholder(config.firebaseWebApiKey)) {
    warn('FIREBASE_WEB_API_KEY is not set', 'Only needed for read-only Identity Toolkit lookups; not a secret credential.');
  } else {
    ok('FIREBASE_WEB_API_KEY is set');
  }

  if (config.googleSignInEnabled && !config.googleWebClientId) {
    block('GOOGLE_SIGNIN_ENABLED=true but GOOGLE_WEB_CLIENT_ID is missing or a placeholder', 'Set the OAuth web client id, or disable Google sign-in.');
  }
  if (config.googleSignInEnabled) {
    ok('Google sign-in is enabled with a web client id');
  }
}

// ------------------------------------------------- Android google-services.json
function checkGoogleServices() {
  if (!fs.existsSync(googleServicesPath)) {
    block('apps/android/app/google-services.json is missing', 'Download it from the Firebase console (Android app).');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
  } catch (error) {
    block(`google-services.json is not valid JSON: ${error.message}`, 'Re-download the file from Firebase.');
    return;
  }

  const projectId = parsed?.project_info?.project_id;
  if (isPlaceholder(projectId)) {
    block('google-services.json is still the committed placeholder', 'Replace apps/android/app/google-services.json with the real file.');
    return;
  }
  ok(`google-services.json project: ${projectId}`);

  if (projectId !== config.firebaseProjectId) {
    block(
      `google-services.json project_id "${projectId}" does not match FIREBASE_PROJECT_ID "${config.firebaseProjectId}"`,
      'The API would reject every token the app mints (audience mismatch).',
    );
  } else {
    ok('Android project id matches FIREBASE_PROJECT_ID');
  }

  const client = parsed?.client?.find((entry) => entry?.client_info?.android_client_info?.package_name === ANDROID_PACKAGE)
    ?? parsed?.client?.[0];
  const packageName = client?.client_info?.android_client_info?.package_name;
  if (packageName !== ANDROID_PACKAGE) {
    block(
      `google-services.json package_name is "${packageName}"`,
      `The app's applicationId is ${ANDROID_PACKAGE}. Register that package in Firebase and re-download.`,
    );
  } else {
    ok(`Android package matches ${ANDROID_PACKAGE}`);
  }

  const androidApiKey = client?.api_key?.[0]?.current_key;
  if (isPlaceholder(androidApiKey)) {
    block('google-services.json has no usable api_key', 'Re-download the file from Firebase.');
  } else if (!isPlaceholder(config.firebaseWebApiKey) && androidApiKey !== config.firebaseWebApiKey) {
    warn(
      'FIREBASE_WEB_API_KEY differs from the Android api_key in google-services.json',
      'That is fine if you registered a separate Web app; otherwise copy the Android key.',
    );
  }

  const webClient = client?.oauth_client?.find((entry) => entry?.client_type === 3);
  if (webClient?.client_id) {
    ok(`Web OAuth client found: ${webClient.client_id}`);
    if (isPlaceholder(config.googleWebClientId)) {
      warn(
        'GOOGLE_WEB_CLIENT_ID is not set, but google-services.json contains a web client',
        `Set GOOGLE_WEB_CLIENT_ID=${webClient.client_id} and GOOGLE_SIGNIN_ENABLED=true to enable Google sign-in.`,
      );
    }
  } else {
    warn(
      'No web OAuth client (client_type 3) in google-services.json',
      'Enable the Google provider in Firebase Authentication; it creates the web client the app needs.',
    );
  }
}

// -------------------------------------------------------------- Product gates
function checkGates() {
  if (config.signupEnabled) {
    ok('SIGNUP_ENABLED=true');
  } else {
    block('SIGNUP_ENABLED is not "true"', 'Set it only after Firebase and the policy pages are ready.');
  }

  for (const [label, value] of [
    ['TERMS_VERSION', config.termsVersion],
    ['PRIVACY_VERSION', config.privacyVersion],
  ]) {
    if (isPlaceholder(value)) {
      block(`${label} is not published`, 'Clients must echo this exact version when accepting consent.');
    } else {
      ok(`${label}=${value}`);
    }
  }

  for (const [label, value] of [['TERMS_URL', config.termsUrl], ['PRIVACY_URL', config.privacyUrl]]) {
    if (!isPublishedPolicyUrl(value)) {
      block(`${label} is not a published https page`, 'Publish a reviewed policy page and set the real URL.');
    } else {
      ok(`${label}=${value}`);
    }
  }

  if (!isPublishedPolicyUrl(config.accountDeletionUrl)) {
    warn('ACCOUNT_DELETION_URL is not a published https page', 'Required by Play Store Data Safety before release.');
  } else {
    ok(`ACCOUNT_DELETION_URL=${config.accountDeletionUrl}`);
  }

  const supportEmail = config.supportEmail ?? '';
  if (isPlaceholder(supportEmail) || supportEmail.includes('your-domain') || supportEmail.endsWith('.example')) {
    warn('SUPPORT_EMAIL is not a real address', 'Shown in the profile screen and required for the Play Store listing.');
  } else {
    ok(`SUPPORT_EMAIL=${supportEmail}`);
  }

  if (Number.isFinite(config.minimumUserAge) && config.minimumUserAge >= 18) {
    ok(`MINIMUM_USER_AGE=${config.minimumUserAge}`);
  } else {
    block(`MINIMUM_USER_AGE is ${config.minimumUserAge}`, 'Cash rewards require an 18+ self-declaration.');
  }

  if (config.emailProvider === 'resend' && isPlaceholder(config.emailProviderApiKey)) {
    warn('EMAIL_PROVIDER_API_KEY is not set', 'Transactional receipts and support mail will not send. Firebase sends its own sign-in mail.');
  }
}

function checkOutcome() {
  const firebaseConfigured = isFirebaseAuthConfigured(config);
  const policies = hasPublishedPolicies(config);
  const signIn = isFirebaseSignInEnabled(config);
  const phone = isFirebasePhoneVerificationEnabled(config);

  console.log('\nGate status (evaluated by the same helpers the auth route uses)');
  console.log(`  isFirebaseAuthConfigured          ${firebaseConfigured ? 'true' : 'false'}`);
  console.log(`  hasPublishedPolicies              ${policies ? 'true' : 'false'}`);
  console.log(`  isFirebaseSignInEnabled           ${signIn ? 'true' : 'false'}`);
  console.log(`  isFirebasePhoneVerificationEnabled ${phone ? 'true' : 'false'}`);

  if (!signIn) {
    console.log('\n  → POST /api/v1/auth/firebase/session will return 503 firebase_sign_in_disabled');
  }
  if (!phone) {
    console.log('  → POST /api/v1/auth/withdrawal/phone/verify will return 503 firebase_phone_disabled');
  }
  return { signIn, phone };
}

checkRuntime();
checkNeon();
checkSecrets();
checkFirebase();
checkGoogleServices();
checkGates();

console.log(`\nConfiguration check — ${config.env}`);
console.log('='.repeat(60));
for (const message of results.ok) {
  console.log(`  ok    ${message}`);
}
for (const { message, fix } of results.warning) {
  console.log(`  warn  ${message}`);
  console.log(`        → ${fix}`);
}
for (const { message, fix } of results.blocking) {
  console.log(`  BLOCK ${message}`);
  console.log(`        → ${fix}`);
}

const gates = checkOutcome();

console.log('\n' + '='.repeat(60));
console.log(`  ${results.ok.length} ok · ${results.warning.length} warnings · ${results.blocking.length} blocking`);
if (results.blocking.length > 0) {
  console.log('  NOT READY: fix the BLOCK items above.\n');
  process.exitCode = 1;
} else if (gates.signIn) {
  console.log('  READY: Firebase sign-in is enabled. Run the Neon checks next:');
  console.log('    npm --workspace @rewards-platform/api run migrate');
  console.log('    npm --workspace @rewards-platform/api run smoke:identity\n');
} else {
  console.log('  READY (configuration valid) but the sign-in gate is still closed.\n');
}
