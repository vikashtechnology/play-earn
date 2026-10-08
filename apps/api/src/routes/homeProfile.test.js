import test from 'node:test';
import assert from 'node:assert/strict';

import { handleHomeProfileRoute } from './homeProfile.js';
import { issueAccessToken } from '../security/session.js';
import { AccountNotActiveError } from '../domain/identity.js';

const TEST_JWT_SECRET = 'home-profile-test-secret';

const testConfig = {
  jwtSecret: TEST_JWT_SECRET,
  termsVersion: 'terms-2026-10-01',
  privacyVersion: 'privacy-2026-10-01',
  termsUrl: 'https://playearn.in/terms',
  privacyUrl: 'https://playearn.in/privacy',
  supportEmail: 'support@playearn.example',
  accountDeletionUrl: 'https://playearn.in/delete-account',
};

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

function createDependencies(overrides = {}) {
  const balancesCalls = [];

  return {
    balancesCalls,
    config: testConfig,
    walletRepository: {
      async getBalanceSummary(userId) {
        balancesCalls.push(userId);
        return overrides.balances ?? {
          hasWallet: true,
          balance: 0,
          currencyCode: 'INR',
          walletStatus: 'active',
          availableCoins: 250,
          pendingCoins: 40,
          reservedCoins: 15,
          reversedCoins: 5,
          adMobInAppCoins: 60,
        };
      },
    },
    offerRepository: {
      async listActiveOffers() {
        return overrides.offers ?? [
          { id: 'offer-1', title: 'Quick survey', description: '5 minutes', kind: 'survey', rewardCoins: 120 },
          { id: 'offer-2', title: 'Play Store install', description: 'Approved app', kind: 'install', rewardCoins: 200 },
        ];
      },
    },
    identity: {
      async assertSessionUsable({ userId }) {
        if (overrides.sessionError) {
          throw overrides.sessionError;
        }
        return { status: 'active', minimumKycVerified: overrides.minimumKycVerified ?? false };
      },
      async loadProfile({ userId }) {
        return overrides.profile ?? {
          id: userId,
          firebaseUid: 'firebase-uid-1',
          email: 'player@example.com',
          fullName: 'Test Player',
          phone: '+919876543210',
          emailVerified: true,
          phoneVerified: true,
          minimumKycVerified: overrides.minimumKycVerified ?? false,
          adultSelfDeclared: true,
          status: 'active',
          memberSince: new Date('2026-10-01T00:00:00Z'),
          preferences: { analyticsOptIn: false, personalizedOffersOptIn: true },
          consent: {
            termsVersion: overrides.consentTermsVersion ?? testConfig.termsVersion,
            privacyVersion: testConfig.privacyVersion,
          },
          payoutEligibility: { minimumKycVerified: false, nextAction: 'verify_phone' },
        };
      },
    },
  };
}

async function requestRoute(pathname, { token, dependencies = createDependencies() } = {}) {
  const req = {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const res = createMockResponse();

  await handleHomeProfileRoute(req, res, pathname, dependencies);

  return { status: res.statusCode, body: JSON.parse(res.body), dependencies };
}

test('home route serves guest marketplace content with zero balances', async () => {
  const result = await requestRoute('/api/v1/home');

  assert.equal(result.status, 200);
  assert.equal(result.body.signedIn, false);
  assert.equal(result.body.userId, null);
  assert.equal(result.body.balances.availableCoins, 0);
  assert.equal(result.body.balances.adMobInAppCoins, 0);
  assert.equal(result.body.adMobCoinsRedeemableForCash, false);
  assert.equal(result.body.featured.length, 2);
  assert.equal(result.body.sections.length >= 3, true);
  assert.equal(result.body.payouts.nextAction, 'sign_in');
  assert.deepEqual(result.dependencies.balancesCalls, [], 'guests must not trigger a wallet query');
});

test('home route reads balances and payout state from Neon for a signed-in user', async () => {
  const token = issueAccessToken({ subject: 'user-abc12345', scope: 'user', secret: TEST_JWT_SECRET });
  const result = await requestRoute('/api/v1/home', { token });

  assert.equal(result.status, 200);
  assert.equal(result.body.signedIn, true);
  assert.equal(result.body.userId, 'user-abc12345');
  assert.equal(result.body.balances.availableCoins, 250);
  assert.equal(result.body.balances.pendingCoins, 40);
  assert.equal(result.body.balances.reservedCoins, 15);
  assert.equal(result.body.balances.reversedCoins, 5);
  assert.equal(result.body.balances.adMobInAppCoins, 60);
  assert.equal(result.body.payouts.nextAction, 'verify_phone');
  assert.deepEqual(result.dependencies.balancesCalls, ['user-abc12345']);

  const verified = await requestRoute('/api/v1/home', {
    token,
    dependencies: createDependencies({ minimumKycVerified: true }),
  });
  assert.equal(verified.body.payouts.nextAction, null);
});

test('profile route returns the Neon-backed identity, consent, and payout state', async () => {
  const token = issueAccessToken({ subject: 'user-abc12345', scope: 'user', secret: TEST_JWT_SECRET });
  const result = await requestRoute('/api/v1/profile', { token });

  assert.equal(result.status, 200);
  assert.equal(result.body.signedIn, true);
  assert.equal(result.body.user.id, 'user-abc12345');
  assert.equal(result.body.user.firebaseUid, 'firebase-uid-1');
  assert.equal(result.body.user.email, 'player@example.com');
  assert.equal(result.body.user.fullName, 'Test Player');
  assert.equal(result.body.user.minimumKycVerified, false);
  assert.equal(result.body.referral.code, 'PEARN-USERABC1');
  assert.equal(result.body.preferences.personalizedOffersOptIn, true);
  assert.equal(result.body.consent.refreshRequired, false);
  assert.equal(result.body.support.email, 'support@playearn.example');
  assert.equal(result.body.accountDeletion.url, 'https://playearn.in/delete-account');
  assert.equal(result.body.accountDeletion.available, false);
});

test('profile route flags consent refresh when published policy versions change', async () => {
  const token = issueAccessToken({ subject: 'user-1', scope: 'user', secret: TEST_JWT_SECRET });
  const result = await requestRoute('/api/v1/profile', {
    token,
    dependencies: createDependencies({ consentTermsVersion: 'terms-2025-01-01' }),
  });

  assert.equal(result.body.consent.refreshRequired, true);
  assert.equal(result.body.consent.termsVersion, 'terms-2025-01-01');
});

test('profile route describes the signed-out state without a database round trip', async () => {
  const result = await requestRoute('/api/v1/profile');

  assert.equal(result.status, 200);
  assert.equal(result.body.signedIn, false);
  assert.equal(result.body.user, null);
  assert.equal(result.body.referral, null);
  assert.equal(result.body.consent.termsUrl, 'https://playearn.in/terms');
  assert.deepEqual(result.dependencies.balancesCalls, []);
});

test('profile and home reject sessions revoked or suspended since issue', async () => {
  const token = issueAccessToken({ subject: 'user-1', scope: 'user', secret: TEST_JWT_SECRET });
  const dependencies = createDependencies({ sessionError: new AccountNotActiveError() });

  const profile = await requestRoute('/api/v1/profile', { token, dependencies });
  assert.equal(profile.status, 403);
  assert.equal(profile.body.code, 'account_not_active');

  const home = await requestRoute('/api/v1/home', { token, dependencies: createDependencies({ sessionError: new AccountNotActiveError() }) });
  assert.equal(home.status, 403);
});

test('home and profile never expose secrets or raw infrastructure values', async () => {
  const token = issueAccessToken({ subject: 'user-1', scope: 'user', secret: TEST_JWT_SECRET });
  const profile = await requestRoute('/api/v1/profile', { token });
  const home = await requestRoute('/api/v1/home', { token });

  for (const result of [profile, home]) {
    assert.equal(JSON.stringify(result.body).includes(TEST_JWT_SECRET), false);
    assert.equal(JSON.stringify(result.body).includes('postgres'), false);
  }
});

test('unknown home/profile paths and methods are rejected', async () => {
  const unknown = await requestRoute('/api/v1/unknown');
  assert.equal(unknown.status, 404);

  const res = createMockResponse();
  await handleHomeProfileRoute({ method: 'POST', headers: {} }, res, '/api/v1/home', createDependencies());
  assert.equal(res.statusCode, 405);
});
