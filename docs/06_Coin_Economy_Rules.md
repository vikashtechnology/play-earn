# 06 — Coin Economy Rules

**Version:** 1.0 | **Date:** 2026-10-06  
**Status:** Living document — review before every major release

---

## 1. Core Principles

| Rule | Detail |
|------|--------|
| Earn-only | Users can never purchase coins with real money |
| Non-transferable | Coins cannot be sent to other users |
| Non-cash-equivalent | Coins are an internal rewards unit, not a stored-value instrument |
| Source tagging | Every ledger entry must record `coin_source` |
| Append-only ledger | Never mutate or delete entries; reversals create new negative entries |

---

## 2. Coin Sources

| Source | Redeemable for Cash / Gift Cards? | Notes |
|--------|-----------------------------------|-------|
| `offerwall` | ✅ Yes (after approval + KYC for cash) | Primary redeemable source |
| `cpe` / `cpa` | ✅ Yes | Same as offerwall |
| `referral` | ✅ Yes (with abuse controls) | Subject to fraud rules |
| `promo` / `admin` | Configurable | Usually gift-card only or limited |
| `admob` | ❌ Never | In-app use only (discounts, features ≤ 25% value) |
| `daily_checkin` | Configurable | Prefer gift-card / product only |

**Critical:** AdMob coins must never become cash or gift cards. Prefer a separate balance or strict source filtering at redemption time.

---

## 3. Coin Lifecycle States

```text
CLICKED → PENDING → VERIFIED → AVAILABLE → RESERVED → REDEEMED
                                      ↘ REVERSED / CHARGEBACK
Suspicious paths: PENDING_REVIEW | REJECTED
```

| State | Meaning | User Visible? |
|-------|---------|---------------|
| PENDING | Postback received, waiting approval window | Yes (“Pending”) |
| AVAILABLE | Cleared and spendable | Yes |
| RESERVED | Locked for an in-progress redemption | Shown as “Reserved” |
| REDEEMED | Successfully used | In history |
| REVERSED | Chargeback or fraud reversal | In history (negative) |

---

## 4. Approval Windows (Default)

| Offer Type | Pending Window | Notes |
|------------|----------------|-------|
| App install (Play Store) | 24–72 hours | Provider dependent |
| Survey / CPA | 1–24 hours | Usually faster |
| Multi-event CPE | Per milestone | Track each event |
| Referral | 7–14 days | Higher fraud risk |

Admin can override per campaign. Never credit AVAILABLE before the window + provider confirmation.

---

## 5. Redemption Rules

### 5.1 Cash Withdrawal (UPI / Bank)

- Minimum: Configurable (recommended ₹50–₹100)
- Maximum per day / month: Configurable + KYC tier limits
- Requires Full or Minimum KYC (see `04_Why_KYC_Is_Required.md`)
- Only `offerwall` / `cpe` / `cpa` / approved `referral` coins
- Coins are **reserved** first → payout success → commit; failure → release

### 5.2 Gift Cards

- Minimum denomination set by catalog
- Same source restrictions as cash (or looser if desired)
- Use provider API only (Xoxoday etc.). Never generate codes locally.

### 5.3 Products (Coins + Cash Co-pay)

- Coin portion + INR portion must be handled transactionally
- Reserve coins → create Razorpay order → on `payment.captured` finalize both

### 5.4 AdMob Coins

- Can only be spent on in-app features or discounts whose monetary value is clearly limited
- Never appear in cash or gift-card redemption screens

---

## 6. Expiry & Breakage

| Parameter | Recommended Default |
|-----------|---------------------|
| Expiry | 12 months from AVAILABLE date |
| Warning | 30 days before expiry (push + in-app) |
| Breakage | Expired coins → zero; disclosed in Reward Rules |
| Reactivation | Not allowed after expiry |

Document clearly in Terms / Reward Rules.

---

## 7. Limits (Starting Values — Tune Later)

| Limit | Suggested Start |
|-------|-----------------|
| Max earn per day (AVAILABLE) | 5,000 RC |
| Max cash withdrawal per day | ₹500 (after KYC) |
| Max cash withdrawal per month | ₹10,000 (Minimum KYC) / higher after Full KYC |
| Max concurrent PENDING offers | 10 |
| Max open reservations | 3 |

---

## 8. Ledger Requirements

Every entry must contain:

- `idempotency_key` (unique)
- `coin_source`
- `reference_type` + `reference_id`
- `status`
- `created_at`
- Optional: `expires_at`, `reservation_id`

Balance = `SUM(coins)` where status allows it. Cached balance is derived only.

---

## 9. Reversal & Chargeback

1. Create a new negative ledger entry (never edit original).
2. If coins already redeemed → mark user for recovery / block future payouts.
3. Notify user.
4. Log in fraud_events and admin_audit_log.

---

## 10. Configuration

All rates, windows, limits, and expiry must be **configurable** (admin or config service). Never hard-code production economics in the app.
