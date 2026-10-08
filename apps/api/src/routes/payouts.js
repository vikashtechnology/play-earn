import { createPayoutRequest, isPayoutAllowed, resolvePayoutStatus } from '../domain/payouts.js';
import { parseCashWithdrawalRequest } from '@rewards-platform/validation';
import { verifyAccessToken } from '../security/session.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { createIdentityRepository } from '../db/identityRepository.js';

const payoutStore = new Map();
const idempotencyStore = new Map();

const seededPayouts = [
  {
    id: 'payout-1',
    userId: 'user-1',
    amount: 200,
    provider: 'razorpayx',
    payoutType: 'upi',
    status: 'pending',
  },
];

for (const payout of seededPayouts) {
  payoutStore.set(`${payout.userId}:${payout.id}`, createPayoutRequest(payout));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');

      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

export function listPayoutsForUser(userId) {
  return [...payoutStore.values()]
    .filter((payout) => payout.userId === userId)
    .map((payout) => ({ ...payout, status: resolvePayoutStatus(payout.status) }));
}

// Payout eligibility is read from Neon: account status, Minimum KYC (Firebase
// phone verification), and the session revocation watermark.
async function resolvePayoutEligibility(dependencies, userId) {
  if (typeof dependencies.hasMinimumKyc === 'function') {
    return {
      status: 'active',
      minimumKycVerified: (await dependencies.hasMinimumKyc(userId)) === true,
      tokensRevokedBefore: null,
    };
  }

  const eligibility = await dependencies.identityRepository.findPayoutEligibility(userId);

  return eligibility ?? { status: 'missing', minimumKycVerified: false, tokensRevokedBefore: null };
}

function isSessionRevoked(eligibility, session) {
  if (!eligibility.tokensRevokedBefore || typeof session?.iat !== 'number') {
    return false;
  }

  const revokedBeforeSeconds = Math.floor(new Date(eligibility.tokensRevokedBefore).getTime() / 1000);
  return session.iat <= revokedBeforeSeconds;
}

function authorizeUser(req, requestedUserId, verifyToken) {
  const authorization = req.headers.authorization ?? '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const session = tokenMatch ? verifyToken(tokenMatch[1]) : null;

  if (!session) return { status: 401, error: 'Sign in is required.' };
  if (session.sub !== requestedUserId) return { status: 403, error: 'This account cannot access that resource.' };
  return { session };
}

function defaultPayoutDependencies() {
  return {
    verifyToken: (token) => verifyAccessToken(token, config.jwtSecret, { scope: 'user' }),
    identityRepository: createIdentityRepository(pool),
  };
}

export async function handlePayoutsRoute(req, res, userId, pathname, dependencies = defaultPayoutDependencies()) {
  const authorization = authorizeUser(req, userId, dependencies.verifyToken);
  if (!authorization.session) {
    res.writeHead(authorization.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: authorization.error }));
    return;
  }

  if (req.method === 'GET' && pathname === `/api/v1/payouts/${userId}`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ payouts: listPayoutsForUser(userId) }));
    return;
  }

  if (req.method === 'POST' && pathname === `/api/v1/payouts/${userId}`) {
    try {
      const payload = parseCashWithdrawalRequest(await readBody(req));
      const idempotencyKey = `${userId}:${payload.idempotencyKey}`;
      const existingPayoutId = idempotencyStore.get(idempotencyKey);

      if (existingPayoutId) {
        const existingPayout = payoutStore.get(`${userId}:${existingPayoutId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ payout: existingPayout }));
        return;
      }

      const eligibility = await resolvePayoutEligibility(dependencies, userId);

      if (isSessionRevoked(eligibility, authorization.session)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Your session was signed out. Please sign in again.',
          code: 'SESSION_REVOKED',
          nextAction: 'sign_in',
        }));
        return;
      }

      if (eligibility.status !== 'active') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'This account cannot request a cash withdrawal right now.',
          code: 'ACCOUNT_NOT_ACTIVE',
        }));
        return;
      }

      if (!eligibility.minimumKycVerified) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Firebase phone verification (Minimum KYC) is required before cash withdrawal.',
          code: 'MINIMUM_KYC_REQUIRED',
          nextAction: 'verify_phone',
        }));
        return;
      }

      const payout = createPayoutRequest({
        userId,
        amount: payload.amount,
        provider: 'razorpayx',
        payoutType: payload.payoutType,
        status: 'pending',
      });

      if (!isPayoutAllowed(payout)) {
        throw new Error('payout request is not allowed');
      }

      const payoutId = `payout-${Date.now()}`;
      const createdPayout = { ...payout, id: payoutId };
      payoutStore.set(`${userId}:${payoutId}`, createdPayout);
      idempotencyStore.set(idempotencyKey, payoutId);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ payout: createdPayout }));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown payout error';
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'payout route not found' }));
}
