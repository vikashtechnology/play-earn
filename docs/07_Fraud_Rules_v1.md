# 07 — Fraud Rules v1

**Version:** 1.0 | **Date:** 2026-10-06  
**Status:** Starting rule set — tune with real data after soft launch

> These are operational starting points, not legal advice. Adjust thresholds after observing real traffic.

---

## 1. Goals

- Protect reward liability and contribution margin
- Reduce chargebacks and provider reversals
- Keep legitimate users unblocked
- Provide clear audit trail for every automated action

---

## 2. Risk Signals & Starting Actions

| Signal | Threshold (Start) | Automatic Action | Manual Review? |
|--------|-------------------|------------------|----------------|
| New accounts from same device | ≥ 3 in 24 h | Hold rewards on new accounts | Yes |
| New accounts from same IP | ≥ 5 in 1 h | Throttle OTP + flag | Yes |
| Offer starts per user | ≥ 15 in 1 h | Temporary throttle | No |
| Conversion rate anomaly | > 3× cohort average | Move to PENDING_REVIEW | Yes |
| Install source ≠ Play Store | Any | Reject reward + flag user | Yes |
| Withdrawal velocity | ≥ 3 successful in 24 h or > ₹2,000 | Hold next withdrawal | Yes |
| Referral self-loops / same device | Detected | Block referral rewards | Yes |
| Provider chargeback / reversal | Any | Reverse coins + raise risk score | Yes |
| Multiple failed penny-drops | ≥ 3 | Lock payout methods | Yes |
| High-risk device fingerprint cluster | Score > threshold | Hold all rewards | Yes |

---

## 3. Risk Score (Simple Model)

Start with a 0–100 score. Increase on negative signals, decrease slowly on good behaviour.

| Event | Score Change |
|-------|--------------|
| Clean conversion + approval | −2 |
| Successful low-value withdrawal | −1 |
| Rapid offer starts | +10 |
| Device / IP multi-account | +25 |
| Non-Play-Store install attempt | +40 |
| Chargeback / reversal | +50 |
| Manual clear by Risk team | Reset or −30 |

**Actions by score band**

| Score | Status | Effect |
|-------|--------|--------|
| 0–29 | Low | Normal |
| 30–59 | Medium | Extra approval window / lower limits |
| 60–79 | High | All rewards PENDING_REVIEW + withdrawal hold |
| 80–100 | Critical | Account restricted / blocked |

---

## 4. Device & Account Controls

- Store install referrer, advertising ID (where permitted), device model, OS version, and a server-side device fingerprint.
- One primary account per strong device signal is preferred.
- Allow limited multi-account only after manual review.
- Block known emulator / rooted / hooked environments when confidence is high (false-positive sensitive).

---

## 5. Offer & Conversion Controls

1. Only accept S2S postbacks with valid signature.
2. Enforce idempotency on `provider + conversion_id`.
3. Validate Play Store referrer and click_id match.
4. Reject if landing URL was not Play Store at click time.
5. Cap PENDING offers per user.
6. Never credit on client-side timer or local “install detected”.

---

## 6. Payout Controls

- KYC mandatory before first cash withdrawal.
- Penny-drop / name match required for bank/UPI.
- Daily and monthly limits (see Coin Economy Rules).
- First withdrawal of a new user → manual or elevated review.
- Velocity checks before calling RazorpayX.
- Idempotency key + IP allowlist on every payout call.

---

## 7. Referral Abuse

- Reward only after referred user completes a verified paid action (not just install).
- Same device / same payment method → no referral credit.
- Cap referral earnings per user per month.
- Monitor for circular referral rings.

---

## 8. Automated vs Manual

| Action | Can be fully automatic? |
|--------|-------------------------|
| Throttle / rate-limit | Yes |
| Move to PENDING_REVIEW | Yes |
| Reject non-Play-Store install | Yes |
| Reverse on provider chargeback | Yes |
| Permanent account block | Prefer manual (or dual control) |
| Large balance adjustment | Dual authorization + audit |

---

## 9. Logging & Audit

Every automated decision must write to:

- `fraud_events` (user, type, score, evidence, action)
- `admin_audit_log` when an admin overrides

Keep evidence (referrer string, IP, device hash, postback payload hash) for at least 12–24 months.

---

## 10. Review Cadence

- Daily: high-score queue and chargeback list
- Weekly: threshold tuning with Finance + Ops
- After any major fraud incident: full rule review

---

## 11. Configuration

All thresholds, score weights, and limits must be configurable without code deploy (feature flag / admin settings). Record who changed what and when.
