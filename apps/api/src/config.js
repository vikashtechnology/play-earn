import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(currentDir, '../.env');

if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const env = process.env;

function readList(value, fallback) {
  const source = value ?? fallback;
  return source
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export const config = {
  env: env.NODE_ENV ?? 'development',
  port: Number(env.PORT ?? 4000),
  // Neon: POSTGRES_URL is the pooled connection string used by the API,
  // MIGRATIONS_DATABASE_URL is the direct (non-pooled) connection string used
  // by the migration runner. Both must include sslmode=require.
  postgresUrl: env.POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/rewards_platform',
  migrationsPostgresUrl: env.MIGRATIONS_DATABASE_URL ?? env.POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/rewards_platform',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: env.JWT_SECRET ?? 'development-secret-change-me',

  // Firebase Auth is the only identity provider.
  authProvider: env.AUTH_PROVIDER ?? 'firebase',
  firebaseAuthEnabled: env.FIREBASE_AUTH_ENABLED === 'true',
  firebaseProjectId: env.FIREBASE_PROJECT_ID ?? '',
  // Public Firebase web API key. Server-side only; it is not a secret credential
  // and is never sent to clients by this API.
  firebaseWebApiKey: env.FIREBASE_WEB_API_KEY ?? '',
  firebaseCertsUrl: env.FIREBASE_CERTS_URL ?? '',
  firebaseAllowedSignInProviders: readList(
    env.FIREBASE_ALLOWED_SIGN_IN_PROVIDERS,
    'emailLink,password,google.com,phone.com',
  ),

  // Product/compliance gates.
  signupEnabled: env.SIGNUP_ENABLED === 'true',
  minimumUserAge: Number(env.MINIMUM_USER_AGE ?? 18),
  googleSignInEnabled: env.GOOGLE_SIGNIN_ENABLED === 'true',
  googleWebClientId: env.GOOGLE_WEB_CLIENT_ID ?? '',
  supportEmail: env.SUPPORT_EMAIL ?? '',
  // Play Store requires a public web page with account deletion instructions.
  accountDeletionUrl: env.ACCOUNT_DELETION_URL ?? '',
  termsVersion: env.TERMS_VERSION ?? '',
  privacyVersion: env.PRIVACY_VERSION ?? '',
  termsUrl: env.TERMS_URL ?? '',
  privacyUrl: env.PRIVACY_URL ?? '',

  // Transactional email (Resend) for receipts and support replies, not for
  // Firebase verification mail.
  emailProvider: env.EMAIL_PROVIDER ?? 'resend',
  emailProviderApiKey: env.EMAIL_PROVIDER_API_KEY ?? '',
  emailFrom: env.EMAIL_FROM ?? '',

  // Legacy self-hosted phone OTP. Kept as a fallback only; Firebase phone auth
  // is the primary Minimum-KYC path.
  otpHashSecret: env.OTP_HASH_SECRET ?? env.JWT_SECRET ?? 'development-otp-hash-secret-change-me',
  otpDeliveryEnabled: env.OTP_DELIVERY_ENABLED === 'true',
  otpProvider: env.OTP_PROVIDER ?? 'fast2sms',
  otpProviderApiKey: env.OTP_PROVIDER_API_KEY ?? '',
};

export function isFirebaseAuthConfigured(authConfig = config) {
  return authConfig.authProvider === 'firebase'
    && authConfig.firebaseAuthEnabled
    && Boolean(authConfig.firebaseProjectId);
}
