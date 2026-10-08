// Neon-backed wallet reads. Coin buckets follow docs/06_Coin_Economy_Rules.md:
// AdMob coins are reported separately because they are in-app-only and can
// never be redeemed for cash or gift cards.
export const EMPTY_BALANCE_SUMMARY = {
  hasWallet: false,
  balance: 0,
  currencyCode: 'INR',
  walletStatus: 'none',
  availableCoins: 0,
  pendingCoins: 0,
  reservedCoins: 0,
  reversedCoins: 0,
  adMobInAppCoins: 0,
};

export function createWalletRepository(pool) {
  function toNumber(value) {
    return value === null || value === undefined ? 0 : Number(value);
  }

  return {
    async getBalanceSummary(userId) {
      // One wallet per user (UNIQUE on wallets.user_id), so the GROUP BY
      // collapses to a single row and yields zero rows for an unknown user.
      const result = await pool.query(`
        SELECT
          w.balance,
          w.currency_code,
          w.status AS wallet_status,
          COALESCE(SUM(CASE
            WHEN lower(wt.source_type) = 'admob'
              THEN CASE WHEN lower(wt.direction) = 'credit' THEN wt.amount ELSE -wt.amount END
            ELSE 0
          END), 0) AS admob_in_app_coins,
          COALESCE(SUM(CASE
            WHEN lower(wt.source_type) <> 'admob' AND lower(wt.status) = 'pending'
              THEN CASE WHEN lower(wt.direction) = 'credit' THEN wt.amount ELSE -wt.amount END
            ELSE 0
          END), 0) AS pending_coins,
          COALESCE(SUM(CASE
            WHEN lower(wt.source_type) <> 'admob' AND lower(wt.status) = 'reserved'
              THEN abs(wt.amount)
            ELSE 0
          END), 0) AS reserved_coins,
          COALESCE(SUM(CASE
            WHEN lower(wt.source_type) <> 'admob' AND lower(wt.status) = 'reversed'
              THEN abs(wt.amount)
            ELSE 0
          END), 0) AS reversed_coins,
          COALESCE(SUM(CASE
            WHEN lower(wt.source_type) <> 'admob'
              AND (wt.status IS NULL OR lower(wt.status) NOT IN ('pending', 'reserved', 'reversed'))
              THEN CASE WHEN lower(wt.direction) = 'credit' THEN wt.amount ELSE -wt.amount END
            ELSE 0
          END), 0) AS available_coins
        FROM wallets w
        LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
        WHERE w.user_id = $1
        GROUP BY w.id, w.balance, w.currency_code, w.status
        LIMIT 1
      `, [userId]);

      const row = result.rows[0];

      if (!row) {
        return { ...EMPTY_BALANCE_SUMMARY };
      }

      return {
        hasWallet: true,
        balance: toNumber(row.balance),
        currencyCode: row.currency_code ?? 'INR',
        walletStatus: row.wallet_status ?? 'active',
        availableCoins: toNumber(row.available_coins),
        pendingCoins: toNumber(row.pending_coins),
        reservedCoins: toNumber(row.reserved_coins),
        reversedCoins: toNumber(row.reversed_coins),
        adMobInAppCoins: toNumber(row.admob_in_app_coins),
      };
    },

    async listTransactions(userId, { limit = 25 } = {}) {
      const result = await pool.query(`
        SELECT wt.id, wt.type, wt.direction, wt.amount, wt.currency_code, wt.reason,
               wt.source_type, wt.source_id, wt.status, wt.created_at
        FROM wallet_transactions wt
        JOIN wallets w ON w.id = wt.wallet_id
        WHERE w.user_id = $1
        ORDER BY wt.created_at DESC
        LIMIT $2
      `, [userId, limit]);

      return result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        direction: row.direction,
        amount: toNumber(row.amount),
        currencyCode: row.currency_code,
        reason: row.reason,
        sourceType: row.source_type,
        sourceId: row.source_id,
        status: row.status,
        createdAt: row.created_at,
      }));
    },
  };
}

