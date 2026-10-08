// Neon-backed offer reads for the marketplace home screen. Install offers are
// only ever surfaced with a Google Play Store landing URL, matching the
// platform rule that no third-party APK sources may be promoted.
const PLAY_STORE_PREFIX = 'https://play.google.com/';

// A single place decides what may be shown to a user, so the list view and the
// detail view can never disagree.
function isServable(row) {
  if (row.status !== 'active') {
    return false;
  }
  if (row.kind === 'install') {
    return typeof row.landing_url === 'string' && row.landing_url.startsWith(PLAY_STORE_PREFIX);
  }
  return true;
}

function installTargetFor(row) {
  return row.kind === 'install' ? 'google_play' : null;
}

const OFFER_COLUMNS = `id, provider, provider_offer_id, title, description, kind, status,
               payout_coins, country_code, landing_url, verification_mode`;

export function createOfferRepository(pool) {
  return {
    async listActiveOffers({ countryCode = 'IN', limit = 12 } = {}) {
      const result = await pool.query(`
        SELECT ${OFFER_COLUMNS}
        FROM offers
        WHERE status = 'active'
          AND country_code = $1
          AND (kind <> 'install' OR landing_url LIKE '${PLAY_STORE_PREFIX}%')
        ORDER BY payout_coins DESC, created_at DESC
        LIMIT $2
      `, [countryCode, limit]);

      return result.rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerOfferId: row.provider_offer_id,
        title: row.title,
        description: row.description,
        kind: row.kind,
        status: row.status,
        rewardCoins: Number(row.payout_coins),
        countryCode: row.country_code,
        landingUrl: row.landing_url,
        installTarget: installTargetFor(row),
        verificationMode: row.verification_mode,
      }));
    },

    async findById(offerId) {
      const result = await pool.query(`
        SELECT ${OFFER_COLUMNS}
        FROM offers
        WHERE id = $1
        LIMIT 1
      `, [offerId]);

      const row = result.rows[0];
      // Drafts, expired offers, and sideload installs are treated as missing so
      // a direct id lookup can never bypass the marketplace rules.
      if (!row || !isServable(row)) {
        return null;
      }

      return {
        id: row.id,
        provider: row.provider,
        providerOfferId: row.provider_offer_id,
        title: row.title,
        description: row.description,
        kind: row.kind,
        status: row.status,
        rewardCoins: Number(row.payout_coins),
        countryCode: row.country_code,
        landingUrl: row.landing_url,
        installTarget: installTargetFor(row),
        verificationMode: row.verification_mode,
      };
    },
  };
}
