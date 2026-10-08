// HTTP smoke test: mounts the real createApp() request handler and exercises
// every route, asserting on status codes rather than printing them.
//
// This complements the other checks:
//   npm test           unit + pg-mem repository tests, no HTTP and no network
//   npm run db:verify  migrations + identity smoke test against real Neon
//   npm run smoke:http this file — the actual HTTP surface, end to end
//
// It mounts createApp() directly instead of src/server.js because server.js
// refuses to boot until Neon answers. That is correct for production, but it
// would make the routes untestable anywhere the database is not reachable. Each
// case therefore accepts either a success status or the documented
// database-unavailable status, and no case may ever produce a 500 or a dropped
// connection: an exception escaping an async request handler is an unhandled
// rejection, which is fatal in Node and would take the whole API down.
//
// Exit code is non-zero if any case fails, so this can gate a deploy.
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { issueAccessToken } from '../src/security/session.js';

const HOST = process.env.SMOKE_HOST ?? '0.0.0.0';
const PORT = Number(process.env.SMOKE_PORT ?? 4100);

// Minted locally and never printed: it is a valid 15-minute session token for
// the subject below, signed with this environment's JWT_SECRET.
const USER_ID = 'smoke-user';
const sessionToken = issueAccessToken({
  subject: USER_ID,
  scope: 'user',
  secret: config.jwtSecret,
  claims: { minimum_kyc: true, email: 'smoke@example.com' },
});

const DB_UNAVAILABLE = [503];
const results = [];

async function run(label, method, path, { body, auth, accept, expectBody } = {}) {
  const started = Date.now();

  try {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: `Bearer ${auth === true ? sessionToken : auth}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const ms = Date.now() - started;
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    const accepted = accept.includes(response.status);
    const bodyOk = typeof expectBody === 'function' ? expectBody(json, text) : true;
    const pass = accepted && bodyOk && response.status !== 500;

    results.push({ label, pass, detail: `${response.status} in ${ms}ms` });
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${String(response.status).padEnd(4)}${String(ms).padStart(5)}ms  ${label.padEnd(48)}${text.slice(0, 72).replace(/\s+/g, ' ')}`,
    );
  } catch (error) {
    // A dropped connection means the process died while handling the request.
    results.push({ label, pass: false, detail: `no response: ${error.message}` });
    console.log(`FAIL  ----      0ms  ${label.padEnd(48)}NO RESPONSE — ${error.message}`);
  }
}

const server = createApp();
await new Promise((resolve) => server.listen(PORT, HOST, resolve));
console.log(`\nSmoke testing the HTTP surface on http://${HOST}:${PORT}`);
console.log(`signupEnabled=${config.signupEnabled}  firebaseProjectId=${config.firebaseProjectId || '(unset)'}\n`);

// --- service ---
await run('GET /', 'GET', '/', { accept: [200] });
await run('GET /api/health', 'GET', '/api/health', {
  accept: [200],
  expectBody: (json) => json?.ok === true,
});
await run('GET /unknown-route', 'GET', '/api/v1/does-not-exist', { accept: [404] });

// --- auth ---
await run('GET /api/v1/auth/policies', 'GET', '/api/v1/auth/policies', { accept: [200] });
await run('POST /auth/firebase/session (bad token)', 'POST', '/api/v1/auth/firebase/session', {
  body: { idToken: 'not.a.token' },
  // 503 while the sign-up gate is closed; 401 once it is open.
  accept: [401, 503],
});
await run('POST /auth/withdrawal/phone/verify (authed)', 'POST', '/api/v1/auth/withdrawal/phone/verify', {
  body: { idToken: 'not.a.token' },
  auth: true,
  // 401 bad token, 503 Firebase certs or Neon unreachable. Never 500.
  accept: [400, 401, ...DB_UNAVAILABLE],
});
await run('POST /auth/session/revoke (authed)', 'POST', '/api/v1/auth/session/revoke', {
  body: {},
  auth: true,
  accept: [200, ...DB_UNAVAILABLE],
});
await run('GET /api/v1/home (authed)', 'GET', '/api/v1/home', {
  auth: true,
  accept: [200, ...DB_UNAVAILABLE],
});
await run('GET /api/v1/profile (authed)', 'GET', '/api/v1/profile', {
  auth: true,
  accept: [200, ...DB_UNAVAILABLE],
});

// --- marketplace (in-memory today, Neon-backed after the repository wiring) ---
await run('GET /api/v1/offers', 'GET', '/api/v1/offers', { accept: [200, ...DB_UNAVAILABLE] });
await run('POST /api/v1/offers (survey)', 'POST', '/api/v1/offers', {
  body: { provider: 'tapjoy', title: 'Smoke Survey', kind: 'survey', payoutCoins: 120, countryCode: 'IN', status: 'active' },
  accept: [201, 401, 403, ...DB_UNAVAILABLE],
});
await run('POST /api/v1/offers (APK install rejected)', 'POST', '/api/v1/offers', {
  body: { provider: 'offerwall', title: 'Sideload', kind: 'install', payoutCoins: 200, landingUrl: 'https://example.com/app.apk' },
  accept: [400, 401, 403],
  expectBody: (_json, text) => /Google Play Store|sign in|forbidden/i.test(text),
});
await run('POST /api/v1/offers (Play install)', 'POST', '/api/v1/offers', {
  body: {
    provider: 'offerwall',
    title: 'Partner install',
    kind: 'install',
    payoutCoins: 200,
    landingUrl: 'https://play.google.com/store/apps/details?id=com.example.partner',
  },
  accept: [201, 401, 403, ...DB_UNAVAILABLE],
});
await run('GET /api/v1/products', 'GET', '/api/v1/products', { accept: [200, ...DB_UNAVAILABLE] });

// --- wallet ---
await run(`GET /api/v1/wallet/${USER_ID}`, 'GET', `/api/v1/wallet/${USER_ID}`, {
  auth: true,
  accept: [200, 401, 403, ...DB_UNAVAILABLE],
});
await run('POST /wallet credit', 'POST', `/api/v1/wallet/${USER_ID}/transactions`, {
  body: { direction: 'credit', amount: 500, type: 'reward', reason: 'offer_completed', sourceType: 'offerwall' },
  auth: true,
  accept: [200, 201, 401, 403, ...DB_UNAVAILABLE],
});
await run('POST /wallet overdraw rejected', 'POST', `/api/v1/wallet/${USER_ID}/transactions`, {
  body: { direction: 'debit', amount: 999999, type: 'redemption', reason: 'cash_withdrawal', sourceType: 'payout' },
  auth: true,
  accept: [400, 401, 403, ...DB_UNAVAILABLE],
});

// --- payouts: these three are the crash regressions ---
await run('GET /payouts (no auth)', 'GET', `/api/v1/payouts/${USER_ID}`, { accept: [401] });
await run('GET /payouts (malformed Bearer)', 'GET', `/api/v1/payouts/${USER_ID}`, {
  auth: 'not.a.real.token',
  accept: [401],
});
await run('POST /payouts (valid, authed)', 'POST', `/api/v1/payouts/${USER_ID}`, {
  body: { amount: 100, payoutType: 'upi', idempotencyKey: 'smoke-http-0000000001' },
  auth: true,
  accept: [200, 201, 403, ...DB_UNAVAILABLE],
});
await run('GET /api/health (after every route)', 'GET', '/api/health', {
  accept: [200],
  expectBody: (json) => json?.ok === true,
});

await new Promise((resolve) => server.close(resolve));

const failed = results.filter((entry) => !entry.pass);
console.log(`\n${results.length - failed.length}/${results.length} routes behaved as expected.`);

if (failed.length > 0) {
  console.log('\nFailures:');
  for (const entry of failed) {
    console.log(`  - ${entry.label}: ${entry.detail}`);
  }
  process.exitCode = 1;
} else {
  console.log('No route crashed the process or returned an unexpected status.');
}
