import { config } from '../config.js';
import { verifyAccessToken } from '../security/session.js';
import { EMPTY_BALANCE_SUMMARY } from '../db/walletRepository.js';

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function getOptionalSession(req, verifyToken) {
  const authorization = req.headers.authorization ?? '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

  return tokenMatch ? verifyToken(tokenMatch[1]) : null;
}

function marketplaceSections() {
  return [
    {
      id: 'surveys',
      title: 'Surveys',
      supporting: 'Partner tasks with clear reward conditions and approval windows.',
    },
    {
      id: 'check_ins',
      title: 'Daily check-ins',
      supporting: 'Small recurring coin rewards for returning to the marketplace.',
    },
    {
      id: 'brand_rewards',
      title: 'Brand rewards',
      supporting: 'Sponsored campaigns and promotions from approved partners.',
    },
    {
      id: 'catalog',
      title: 'Products and vouchers',
      supporting: 'Rewards available through approved providers.',
    },
  ];
}

// Home and profile are backed by Neon. Balances, featured offers, and the
// signed-in profile come from the database; the response never contains
// provider credentials, raw IP addresses, or Firebase tokens.
export async function handleHomeProfileRoute(req, res, pathname, dependencies = {}) {
  const authConfig = dependencies.config ?? config;
  const verifyToken = dependencies.verifyToken
    ?? ((token) => verifyAccessToken(token, authConfig.jwtSecret, { scope: 'user' }));
  const session = getOptionalSession(req, verifyToken);
  const userId = session?.sub ?? null;

  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  try {
    if (pathname === '/api/v1/home') {
      const balances = userId && dependencies.walletRepository
        ? await dependencies.walletRepository.getBalanceSummary(userId)
        : EMPTY_BALANCE_SUMMARY;
      const featured = dependencies.offerRepository
        ? (await dependencies.offerRepository.listActiveOffers({ limit: 3 }))
          .map((offer) => ({
            id: offer.id,
            title: offer.title,
            description: offer.description,
            kind: offer.kind,
            rewardCoins: offer.rewardCoins,
            // The client opens install offers in the Play Store only; no
            // third-party APK source may be promoted.
            installTarget: offer.installTarget ?? null,
            landingUrl: offer.landingUrl ?? null,
          }))
        : [];

      let payoutState = { minimumKycVerified: false, nextAction: userId ? 'verify_phone' : 'sign_in' };
      if (userId && dependencies.identity) {
        const eligibility = await dependencies.identity.assertSessionUsable({ userId, issuedAt: session.iat });
        payoutState = {
          minimumKycVerified: eligibility.minimumKycVerified === true,
          nextAction: eligibility.minimumKycVerified ? null : 'verify_phone',
        };
      }

      sendJson(res, 200, {
        signedIn: Boolean(userId),
        userId,
        balances: {
          availableCoins: balances.availableCoins,
          pendingCoins: balances.pendingCoins,
          reservedCoins: balances.reservedCoins,
          reversedCoins: balances.reversedCoins,
          adMobInAppCoins: balances.adMobInAppCoins,
          currencyCode: balances.currencyCode,
        },
        // AdMob coins are in-app-only and can never be redeemed for cash.
        adMobCoinsRedeemableForCash: false,
        featured,
        sections: marketplaceSections(),
        payouts: payoutState,
      });
      return;
    }

    if (pathname === '/api/v1/profile') {
      if (!userId) {
        sendJson(res, 200, {
          signedIn: false,
          user: null,
          referral: null,
          preferences: {
            analyticsOptIn: false,
            personalizedOffersOptIn: false,
            notificationsEnabled: false,
          },
          consent: {
            termsVersion: authConfig.termsVersion || null,
            privacyVersion: authConfig.privacyVersion || null,
            termsUrl: authConfig.termsUrl || null,
            privacyUrl: authConfig.privacyUrl || null,
            refreshRequired: false,
          },
          support: {
            email: authConfig.supportEmail || null,
            categories: ['offers', 'payouts', 'rewards', 'orders', 'account'],
          },
          accountDeletion: {
            available: false,
            url: authConfig.accountDeletionUrl || null,
            status: 'In-app account deletion is a release gate and is not enabled yet.',
          },
        });
        return;
      }

      if (!dependencies.identity) {
        sendJson(res, 503, { error: 'Profile data is unavailable.', code: 'profile_unavailable' });
        return;
      }

      await dependencies.identity.assertSessionUsable({ userId, issuedAt: session.iat });
      const profile = await dependencies.identity.loadProfile({ userId });

      if (!profile) {
        sendJson(res, 404, { error: 'This account no longer exists.', code: 'account_missing' });
        return;
      }

      const consentRefreshRequired = Boolean(
        authConfig.termsVersion
        && authConfig.privacyVersion
        && (profile.consent.termsVersion !== authConfig.termsVersion
          || profile.consent.privacyVersion !== authConfig.privacyVersion),
      );

      sendJson(res, 200, {
        signedIn: true,
        user: {
          id: profile.id,
          firebaseUid: profile.firebaseUid,
          email: profile.email,
          fullName: profile.fullName,
          phone: profile.phone,
          emailVerified: profile.emailVerified,
          phoneVerified: profile.phoneVerified,
          minimumKycVerified: profile.minimumKycVerified,
          adultSelfDeclared: profile.adultSelfDeclared,
          status: profile.status,
          memberSince: profile.memberSince,
        },
        referral: {
          code: `PEARN-${profile.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
          status: 'preview',
        },
        preferences: {
          analyticsOptIn: profile.preferences.analyticsOptIn,
          personalizedOffersOptIn: profile.preferences.personalizedOffersOptIn,
          notificationsEnabled: false,
        },
        consent: {
          termsVersion: profile.consent.termsVersion ?? authConfig.termsVersion ?? null,
          privacyVersion: profile.consent.privacyVersion ?? authConfig.privacyVersion ?? null,
          termsUrl: authConfig.termsUrl || null,
          privacyUrl: authConfig.privacyUrl || null,
          refreshRequired: consentRefreshRequired,
        },
        support: {
          email: authConfig.supportEmail || null,
          categories: ['offers', 'payouts', 'rewards', 'orders', 'account'],
        },
        accountDeletion: {
          available: false,
          url: authConfig.accountDeletionUrl || null,
          status: 'In-app account deletion is a release gate and is not enabled yet.',
        },
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'home/profile route not found' });
  } catch (error) {
    if (error?.code === 'account_not_active' || error?.code === 'invalid_firebase_token') {
      sendJson(res, error.code === 'account_not_active' ? 403 : 401, {
        error: error.message,
        code: error.code,
      });
      return;
    }

    sendJson(res, 503, { error: 'Home and profile data is temporarily unavailable.', code: 'profile_unavailable' });
  }
}
