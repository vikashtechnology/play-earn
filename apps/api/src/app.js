import http from 'node:http';

import { handleOffersRoute } from './routes/offers.js';
import { handleAuthRoute, otpService, identityService as firebaseIdentityService } from './routes/auth.js';
import { handleHomeProfileRoute } from './routes/homeProfile.js';
import { handlePayoutsRoute } from './routes/payouts.js';
import { handleProductsRoute } from './routes/products.js';
import { handleRewardsRoute } from './routes/rewards.js';
import { handleWalletRoute } from './routes/wallet.js';
import { createIdentityRepository } from './db/identityRepository.js';
import { createOfferRepository } from './db/offerRepository.js';
import { createWalletRepository } from './db/walletRepository.js';
import { pool } from './db.js';
import { config } from './config.js';

function defaultHomeProfileDependencies() {
  return {
    identity: firebaseIdentityService,
    walletRepository: createWalletRepository(pool),
    offerRepository: createOfferRepository(pool),
    config,
  };
}

function defaultPayoutDependencies() {
  const identityRepository = createIdentityRepository(pool);

  return {
    identityRepository,
    identity: firebaseIdentityService,
  };
}

export function createApp({
  authService = otpService,
  identityService = firebaseIdentityService,
  authConfig = config,
  payoutDependencies = defaultPayoutDependencies(),
  homeProfileDependencies = defaultHomeProfileDependencies(),
} = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'Rewards Platform API',
        status: 'running',
        version: '0.1.0',
        authProvider: 'firebase',
      }));
      return;
    }

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'rewards-platform-api',
        env: process.env.NODE_ENV ?? 'development',
        authProvider: authConfig.authProvider ?? 'firebase',
        firebaseSignInEnabled: Boolean(
          authConfig.firebaseAuthEnabled && authConfig.firebaseProjectId && authConfig.signupEnabled,
        ),
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (url.pathname.startsWith('/api/v1/auth/')) {
      await handleAuthRoute(req, res, url.pathname, authService, identityService, authConfig);
      return;
    }

    if (url.pathname === '/api/v1/home' || url.pathname === '/api/v1/profile') {
      await handleHomeProfileRoute(req, res, url.pathname, homeProfileDependencies);
      return;
    }

    if (url.pathname === '/api/v1/products' || url.pathname === '/api/v1/orders') {
      await handleProductsRoute(req, res, url.pathname);
      return;
    }

    if (url.pathname === '/api/v1/offers' || url.pathname.startsWith('/api/v1/offers')) {
      await handleOffersRoute(req, res, url.pathname);
      return;
    }

    const rewardsMatch = url.pathname.match(/^\/api\/v1\/rewards\/([^/]+)$/);

    if (rewardsMatch) {
      await handleRewardsRoute(req, res, rewardsMatch[1], url.pathname);
      return;
    }

    const payoutsMatch = url.pathname.match(/^\/api\/v1\/payouts\/([^/]+)$/);

    if (payoutsMatch) {
      await handlePayoutsRoute(req, res, decodeURIComponent(payoutsMatch[1]), url.pathname, payoutDependencies);
      return;
    }

    const walletMatch = url.pathname.match(/^\/api\/v1\/wallet\/([^/]+)(\/transactions)?$/);

    if (walletMatch) {
      await handleWalletRoute(req, res, walletMatch[1], url.pathname);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });
}
