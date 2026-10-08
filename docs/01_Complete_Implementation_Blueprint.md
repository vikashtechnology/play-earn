# India Rewards Marketplace — Complete Compliant Implementation Blueprint

**Version:** 2.0 | **Date:** 2026-10-06  
**Market:** India-first, Android + Web Admin

> **Critical Positioning:** This app is a **rewards marketplace**, NOT an "install apps for money" app. Offerwall is one module among many earning methods. **All app/game install offers must redirect exclusively to the Google Play Store** — no third-party APK sources. AdMob revenue belongs entirely to the platform owner; users receive only non-monetary, in-app coins for watching rewarded ads. Cash/gift-card rewards come exclusively from offerwall/CPE campaigns, completely separated from AdMob.

---

## Table of Contents

1. Legal & Regulatory Compliance Framework
2. Google Play Policy Compliance
3. Play Store-Only Install Rule
4. Provider Integrations & Requirements
5. App UI Architecture
6. Server Workflow & Backend Architecture
7. Admin Panel
8. User Flows
9. Data Model
10. API Specification
11. Financial Model & Unit Economics
12. Fraud & Abuse Controls
13. Launch Checklist
14. References

---

## 1. Legal & Regulatory Compliance Framework

### 1.1 RBI Prepaid Payment Instrument (PPI) Compliance

| Rule | Detail |
|------|--------|
| Coins are earn-only | Users cannot purchase coins with real money |
| Coins are non-transferable | Cannot be sent to other users or converted to cash |
| Coins are non-cash-equivalent | Internal rewards unit, not a stored-value wallet |
| Cash payouts via regulated provider | RazorpayX / Cashfree Payouts only |
| Gift cards via reward provider | Xoxoday / QwikCilver / GyFTR only |
| No own INR wallet | Never hold user INR balances |

### 1.2 DPDP Act 2023 & Rules 2025

| Requirement | Implementation |
|-------------|----------------|
| Consent notices | Standalone, clear, granular |
| Age gate | 18+ or verified parental consent for minors |
| Data localization | Payment data must remain in India |
| Grievance officer | Published contact |
| Data deletion | In-app + web path |

### 1.3 TRAI DLT Compliance (SMS/OTP)

| Step | Detail |
|------|--------|
| Register entity | On operator DLT portal |
| Obtain PEID | 19-digit Principal Entity ID |
| Register Sender ID | 6-char alphabetic code |
| Register templates | Pre-approved, max 180 chars |

### 1.4 CERT-In Requirements

| Requirement | Detail |
|-------------|--------|
| Incident reporting | Within 6 hours to CERT-In |
| VAPT before go-live | Mandatory |
| Annual VAPT | By CERT-In empanelled auditor |

### 1.5 Tax Compliance

| Tax | Applicability |
|-----|---------------|
| GST | Product sales, gift card procurement, co-pay |
| TDS 194R | Benefits/perquisites from business (rewards) |
| TDS 194B | Winnings from lottery/games (if applicable) |

---

## 2. Google Play Policy Compliance

### 2.1 Incentivized Installs — Critical Rule

Google prohibits incentivizing users to install other apps as the app's **main functionality**.

**Compliance Strategy:**
- Home screen shows rewards marketplace first
- Offerwall is ONE section under Earn tab
- Store listing describes broader rewards features
- Admin approval layer rejects non-compliant offers

### 2.2 AdMob Rewarded Ads — Direct Monetary Items Prohibited

| Aspect | AdMob Rewarded Ads | Offerwall/CPE Campaigns |
|--------|-------------------|------------------------|
| Reward type | In-app coins ONLY | Coins (redeemable for cash/gift cards) |
| Cash-out possible? | ❌ No | ✅ Yes |
| UI label | "Watch video to earn in-app coins" | "Complete offer to earn coins" |
| Revenue owner | Platform owner | Platform (after fees) |

### 2.3 Financial Features Declaration

**Mandatory:** Declare "Purchase agreements — Rewards, points, frequent flier miles, and other incentives" in Play Console.

### 2.4 Payments Policy

| Transaction Type | Payment Method |
|-----------------|----------------|
| Physical goods | Razorpay (NOT Play Billing) |
| Digital content | Google Play Billing |
| Gift cards (redeemed with coins) | Does NOT require Play Billing |

### 2.5 Account Deletion

Must provide in-app path + external web link + URL in Play Console.

### 2.6 Target API Level

By **31 August 2026**, target **Android 16 (API 36)** or higher.

### 2.7 Data Safety

Disclose all data collection: phone, device, offerwall SDK, attribution SDK, payout details, analytics.

---

## 3. Play Store-Only Install Rule (Mandatory)

**Requirement:** All app/game install offers must redirect exclusively to Google Play Store.

| Aspect | Implementation |
|--------|----------------|
| Offer source | Configure offerwall to serve only Play Store installs |
| User redirect | Open Play Store via `market://details?id=<package>` |
| Attribution | AppsFlyer/Adjust tracks Play Store installs |
| Backend validation | Reject postbacks where install source ≠ Play Store |
| Admin approval | Verify landing URL before offer goes live |
| User disclosure | "Installs must be completed via Google Play Store" |

**Referrer Validation Logic:**

```typescript
async function validateInstallSource(postback) {
  const referrer = await getPlayInstallReferrer(postback.device_id);
  if (!referrer || !referrer.includes('play.google.com')) {
    throw new Error('Install source is not Play Store');
  }
  if (!referrer.includes(postback.click_id)) {
    throw new Error('Click ID mismatch');
  }
  return true;
}
```

---

## 4. Provider Integrations & Requirements

### 4.1 Payment Gateway — Razorpay

| Item | Requirement |
|------|-------------|
| KYC documents | Business PAN, GST, bank account, address proof |
| Webhook events | payment.authorized, payment.captured, payment.failed |

### 4.2 Payout Provider — RazorpayX

| Item | Requirement |
|------|-------------|
| Idempotency key | Mandatory (`X-Payout-Idempotency` header) |
| IP allowlisting | Mandatory |
| TLS | 1.2+ required |
| KYC | Mandatory for live mode |

### 4.3 Gift Card Provider — Xoxoday Plum

| Item | Detail |
|------|--------|
| Coverage | 1M+ reward options |
| API | REST for programmatic fulfillment |
| Onboarding | Register → Get credentials → Fund → Go live |

### 4.4 Offerwall Providers

| Provider | Features |
|----------|----------|
| Tapjoy (Unity) | CPE milestones, multi-event rewards |
| ironSource (Unity) | Server-to-server callbacks |
| AdGem | Surveys, offers, tasks |

Configure for Play Store-only installs.

### 4.5 Attribution SDK

| Provider | India Note |
|----------|------------|
| AppsFlyer | India data center option |
| Adjust | Extra line for India campaigns; adjust.com blocked in India |

### 4.6 SMS/OTP — Zoho CPaaS (or Fast2SMS / SMSLocal for free tier)

| Item | Requirement |
|------|-------------|
| DLT | PEID, Sender ID, Template approval |
| Pricing | ~₹0.18 per SMS |
| Account | Must be India DC |

### 4.7 Push Notification — FCM

Free, unlimited. Android 13+ requires `POST_NOTIFICATIONS` permission.

### 4.8 KYC Provider

| Provider | Features |
|----------|----------|
| Cashfree Secure ID | Video KYC, Aadhaar/PAN, multilingual |
| Signzy | India KYC, KYB, AML |

### 4.9 Infrastructure

| Component | Recommended |
|-----------|-------------|
| Backend | Node.js + TypeScript |
| Database | PostgreSQL |
| Cache | Redis |
| Admin | Next.js / React |
| Storage | S3-compatible (India region) |
| Monitoring | Sentry |
| Secrets | AWS Secrets Manager |
| Cloud | AWS / GCP India region |

---

## 5. App UI Architecture

### 5.1 Navigation

```
┌─────────┬─────────┬──────────┬─────────┬─────────┐
│  Home   │  Earn   │ Rewards  │ Wallet  │ Profile │
└─────────┴─────────┴──────────┴─────────┴─────────┘
```

### 5.2 Screen Map

| Screen | Key Elements |
|--------|--------------|
| Splash | Logo, loading |
| Onboarding | 3-4 slides, age gate, DPDP consent |
| Phone Auth | +91 input, OTP |
| Consent | Granular DPDP consent, push permission |
| Home | Balance, featured reward, earn highlights, brand deals |
| Earn | Daily check-in, surveys, brand tasks, offerwall, AdMob (separate) |
| Rewards | Gift cards, products, coupons, brand deals |
| Wallet | Balances, ledger, withdrawals, orders |
| Profile | Account, KYC, payout methods, referral, support, legal |
| Offer Detail | Provider, reward, status, steps, Play Store badge |
| Product Detail | Images, MRP, partner price, coin + cash |
| Gift Card Detail | Brand, denominations, coin cost |
| Checkout | Coin reservation, Razorpay checkout |
| Withdrawal | UPI/bank selection, account verification |
| Notifications | Reward credits, payout status |
| Support | FAQ, ticket creation, grievance officer |

### 5.3 AdMob UI Compliance

```
Section Title: "Watch video to earn in-app coins"
Subtitle: "Coins can be used for in-app rewards only"
Reward: "+50 coins"
CTA: "Watch Ad"
Post-Ad: "50 coins credited to your in-app balance"

❌ NEVER: "Watch ad and earn ₹10"
❌ NEVER: "Coins can be redeemed for cash/gift cards"
```

### 5.4 Offerwall UI

```
Section Title: "Complete offers to earn coins"
Install Source: "Google Play Store" (with verified badge)
Status badges: Pending | Approved | Reversed
Report Issue: Button with offer ID + click ID
```

---

## 6. Server Workflow & Backend Architecture

### 6.1 Offer Lifecycle (Play Store-Only)

```
Advertiser creates campaign (Play Store install only)
        ↓
Admin reviews & approves
        ↓
Tracking configured (Play Store source)
        ↓
Offer LIVE
        ↓
User clicks → click_id created
        ↓
App opens Play Store via intent
        ↓
User installs from Play Store
        ↓
Provider verifies event (S2S postback)
        ↓
Backend validates:
  1. Signature
  2. Idempotency
  3. User mapping
  4. No duplicate
  5. Install source = Play Store
        ↓
Ledger entry: PENDING
        ↓
Approval window passes → AVAILABLE
        ↓
Notification sent
```

### 6.2 Wallet Ledger Rules

- Append-only: never UPDATE or DELETE
- Balance = SUM of valid entries
- Cached balance for performance only
- Every entry has: transaction_id, idempotency_key, reference_type, reference_id
- Reversals create NEW negative entry
- Redemption reserves coins → releases on failure
- Admin adjustments require dual authorization + audit log

### 6.3 Webhook Security

| Requirement | Implementation |
|-------------|----------------|
| Signature verification | HMAC on every webhook |
| Replay protection | Store event_id, reject duplicates |
| Idempotency | Process each event exactly once |
| Retry | Exponential backoff + dead-letter queue |
| IP allowlist | Restrict webhook sources |

### 6.4 Reconciliation Jobs

```
Daily:
1. Razorpay settlements vs internal payments
2. RazorpayX payouts vs internal withdrawals
3. Xoxoday orders vs internal gift card orders
4. Offerwall postbacks vs internal conversions
5. Verify all installs from Play Store
6. Flag mismatches → Finance review
```

---

## 7. Admin Panel

### 7.1 Section Map

| Section | Key Functions |
|---------|---------------|
| Dashboard | DAU/MAU, tasks, payout value, fraud rate |
| Users | Search, status, risk, wallet, offers, withdrawals |
| Offers | Create, approve, install source validation (Play Store only) |
| Wallet | Ledger viewer, dual-auth adjustments, reversals |
| Withdrawals | Queue, risk flags, approve/reject, retry |
| Gift Cards | Catalog sync, order history, reconciliation |
| Products | Catalog, pricing, coin/cash split, stock |
| Brands | CRM, contract status, campaigns |
| Fraud | Rules, blocklists, device clusters, manual review |
| Campaigns | Advertiser campaigns, budgets, settlements |
| Finance | Payouts, reconciliation, invoices, GST/TDS |
| Support | Tickets, escalations |
| Audit Logs | Immutable log |
| Settings | Roles, permissions, provider configs |

### 7.2 Admin Roles (RBAC)

| Role | Permissions |
|------|-------------|
| Super Admin | All (secrets outside UI) |
| Operations | Offers, users, support, withdrawals |
| Finance | Payouts, reconciliation, reports |
| Marketing | Campaigns, banners, brands |
| Support | Tickets, user communications |
| Risk/Fraud | Flags, holds, review decisions |
| Analyst | Analytics only |

### 7.3 Offer Approval Workflow (Play Store-Only)

```
Offer submitted
        ↓
Admin reviews:
  1. Description and terms
  2. Reward vs economics
  3. Install source: Must be Google Play Store
  4. Landing URL: Must be Play Store listing
        ↓
If install source ≠ Play Store → REJECT
        ↓
If approved → LIVE
```

---

## 8. User Flows

### 8.1 Onboarding

```
Splash → Onboarding → Phone (+91) → OTP → Age Gate
→ DPDP Consent → Push Permission → Profile Setup → Home
```

### 8.2 Earning Flow (Play Store-Only)

```
Earn tab → Select offer → Offer detail (Play Store badge)
→ Start Offer → click_id created → Play Store opens
→ User installs → Completes event → S2S postback
→ Backend validates (signature, duplicate, Play Store source)
→ Ledger: PENDING → Approval → AVAILABLE → Notification
```

### 8.3 AdMob Rewarded Ad Flow

```
AdMob section → "Watch video to earn in-app coins"
→ Watch ad → In-app coins credited
→ Spend ONLY on in-app features/discounts (≤25% value)
```

### 8.4 Cash Withdrawal Flow

```
Wallet → Redeem → Cash → Select UPI/Bank
→ Verify account (penny drop) → Enter amount
→ KYC check → Risk checks → Reserve coins
→ Create withdrawal → Auto-approve OR manual review
→ Call RazorpayX (idempotency + IP allowlist)
→ Webhook updates status → Success/Failure
```

### 8.5 Gift Card Redemption Flow

```
Wallet → Redeem → Gift Card → Browse Xoxoday catalog
→ Select brand + denomination → Reserve coins
→ Place order (idempotency key) → Receive code/link
→ Secure delivery → Mark redeemed → Reconcile webhook
```

### 8.6 Product + Cash Co-Pay Flow

```
Rewards → Products → Select product
→ Display coin + INR co-pay → Reserve coins
→ Create checkout → Pay INR via Razorpay
→ Webhook: payment.captured → Place fulfillment order
→ Finalize coin deduction → Send tracking
```

---

## 9. Data Model (PostgreSQL)

### 9.1 Core Tables

```sql
users (id, phone_hash, country, status, created_at, last_seen_at)
user_profiles (user_id, display_name, referral_code, payout_preferences)
devices (id, user_id, install_metadata, risk_state)
user_consents (id, user_id, consent_type, granted_at, revoked_at)
kyc_records (id, user_id, provider, status, verified_at, document_hash)

wallet_accounts (id, user_id, cached_balance, created_at)
wallet_ledger (id, user_id, type, coins, reference_type, reference_id,
               idempotency_key, status, created_at)

offers (id, provider, provider_offer_id, reward_coins, status, terms,
        targeting, budget_total, budget_remaining,
        install_source VARCHAR(20) DEFAULT 'play_store',
        landing_url VARCHAR(500))
offer_clicks (id, user_id, offer_id, click_id, started_at, source_metadata)
conversions (id, click_id, provider_conversion_id, event_type, status,
             received_at, payout_amount, reward_coins,
             install_source_validated BOOLEAN)

withdrawals (id, user_id, method, amount_coins, rupee_value, status,
             provider_id, provider_payout_id, idempotency_key, created_at)
gift_catalog (id, provider_product_id, brand, denomination, country,
              active, synced_at)
gift_orders (id, user_id, catalog_id, coins, provider_order_id,
             delivery_status, created_at)
products (id, supplier_id, title, price_inr, coin_price, copay_inr,
          stock_status, shipping_regions)
orders (id, user_id, product_id, coin_amount, cash_amount, payment_id,
        fulfillment_id, status, created_at)

brands (id, legal_name, display_name, gst_details, contact_person,
        contract_status, commission_rate, settlement_terms)
advertisers (id, company_name, contact_person, billing_email, gst_details)
campaigns (id, advertiser_id, campaign_type, budget_total,
           budget_remaining, start_at, end_at, status)

fraud_events (id, user_id, type, score, evidence, action, created_at)
support_tickets (id, user_id, category, status, evidence, resolution)
admin_audit_log (id, admin_id, action, target_type, target_id,
                 before_hash, after_hash, created_at)
webhook_events (id, provider, event_id, signature_valid, processed,
                payload_hash, received_at)
reconciliation_records (id, provider, date, expected_total, actual_total,
                        mismatch_amount, status, resolved_at)
```

### 9.2 Critical Constraints

```sql
CREATE UNIQUE INDEX idx_ledger_idempotency
  ON wallet_ledger (idempotency_key);

CREATE UNIQUE INDEX idx_conversion_event
  ON conversions (provider, provider_conversion_id);

CREATE UNIQUE INDEX idx_withdrawal_idempotency
  ON withdrawals (idempotency_key);

ALTER TABLE offers ADD CONSTRAINT chk_install_source
  CHECK (install_source = 'play_store');

ALTER TABLE offers ADD CONSTRAINT chk_landing_url
  CHECK (landing_url LIKE 'https://play.google.com/store/apps/%'
         OR landing_url LIKE 'market://details?id=%');
```

---

## 10. API Specification

### 10.1 User APIs

```
POST   /v1/auth/send-otp
POST   /v1/auth/verify-otp
GET    /v1/me
GET    /v1/home
GET    /v1/offers
POST   /v1/offers/{id}/start
GET    /v1/wallet
GET    /v1/wallet/ledger
POST   /v1/withdrawals
GET    /v1/withdrawals
GET    /v1/rewards/gift-cards
POST   /v1/rewards/gift-cards/redeem
GET    /v1/rewards/products
POST   /v1/orders
POST   /v1/orders/{id}/payment
POST   /v1/webhooks/{provider}
POST   /v1/account/delete
GET    /v1/support/tickets
POST   /v1/support/tickets
GET    /v1/notifications
```

### 10.2 Advertiser APIs

```
POST   /v1/advertisers/campaigns
GET    /v1/advertisers/campaigns
PATCH  /v1/advertisers/campaigns/{id}
GET    /v1/advertisers/campaigns/{id}/stats
POST   /v1/tracking/postback/{provider}
```

### 10.3 Brand APIs

```
POST   /v1/brands/apply
POST   /v1/brands/products
PATCH  /v1/brands/products/{id}
POST   /v1/brands/deals
GET    /v1/brands/orders
GET    /v1/brands/settlements
```

### 10.4 Admin APIs

```
GET    /v1/admin/users
GET    /v1/admin/wallet/ledger
POST   /v1/admin/wallet/adjust
GET    /v1/admin/withdrawals
POST   /v1/admin/withdrawals/{id}/approve
POST   /v1/admin/withdrawals/{id}/reject
GET    /v1/admin/fraud/flags
POST   /v1/admin/offers/{id}/approve
POST   /v1/admin/offers/{id}/pause
GET    /v1/admin/audit-logs
```

### 10.5 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| HTTPS only | TLS 1.2+ |
| Authentication | JWT / session tokens, short-lived |
| Rate limiting | OTP, login, offer-start, withdrawal |
| Idempotency | All write endpoints affecting coins/orders |
| Admin MFA | Mandatory |
| Secrets | Managed secret store |

---

## 11. Financial Model & Unit Economics

### 11.1 Revenue Streams

| Stream | Who Pays | Platform Earns When |
|--------|----------|---------------------|
| Offer / CPE campaigns | Advertiser | Verified event occurs |
| CPA campaigns | Advertiser | Qualified action occurs |
| Sponsored placement | Brand / advertiser | Campaign sold |
| Product margin | Brand / merchant | Product redeemed |
| Co-pay margin | Brand / merchant | Coins + cash checkout |
| AdMob rewarded ads | Google | Ad shown (platform only) |

### 11.2 Per-Campaign Profitability Check

```
Advertiser payout                ₹10.00
Offer network/provider fee        ₹1.00
Payment/technology cost           ₹0.50
Fraud reserve                     ₹0.50
User reward value                 ₹6.00
--------------------------------------
Estimated contribution            ₹2.00

Rule: Never launch if contribution < 0
```

### 11.3 Coin Economy

| Parameter | Value |
|-----------|-------|
| Coin name | Rewards Coin (RC) |
| Sample rate (UX) | 100 RC = ₹1 |
| Production rate | Configurable, driven by economics |
| Coin states | Pending → Available → Redeemed / Reversed |
| Expiry | Configurable (e.g., 12 months) |

### 11.4 Reward Liability

```
Outstanding coins × configured_coin_rate = Reward Liability
This is a liability, not revenue
```

---

## 12. Fraud & Abuse Controls

### 12.1 Risk Signals

| Signal | Action |
|--------|--------|
| Too many account creations | Hold rewards, review |
| Rapid offer starts | Throttle |
| Unusual conversion pattern | Pending / manual review |
| Payout velocity spike | Temporary hold |
| Provider chargeback | Reverse reward |
| Referral abuse | Block referral rewards |
| Payment mismatch | Do not fulfill order |
| Install source ≠ Play Store | Reject reward, flag user |

### 12.2 Reward States

```
CLICKED → PENDING → VERIFIED → AVAILABLE → REDEEMED
Suspicious: PENDING_REVIEW | REJECTED | REVERSED | CHARGEBACK
```

---

## 13. Launch Checklist

### 13.1 Legal & Compliance

```
[ ] Business entity registered
[ ] Business PAN obtained
[ ] GST registration completed
[ ] Legal opinion on coin/cashout model
[ ] DPDP consent framework implemented
[ ] Grievance officer appointed
[ ] Reward Rules, Withdrawal Rules, Referral Rules published
[ ] Privacy Policy published
[ ] Terms of Service published
[ ] CERT-In empanelled VAPT auditor engaged
```

### 13.2 Provider Accounts

```
[ ] Razorpay account + KYC
[ ] RazorpayX account + KYC
[ ] Xoxoday Plum account + funded
[ ] Offerwall provider account (Play Store-only)
[ ] AppsFlyer / Adjust account
[ ] DLT registration (PEID, Sender ID, templates)
[ ] Zoho CPaaS / Kaleyra / Fast2SMS account
[ ] Firebase project (FCM)
[ ] Cashfree Secure ID / Signzy account
[ ] AWS / GCP account (India region)
```

### 13.3 Google Play Console

```
[ ] Developer account ($25)
[ ] Financial features declaration
[ ] Data Safety form
[ ] Privacy policy link
[ ] Account deletion in-app + web
[ ] Account deletion URL in Console
[ ] Target API 36
[ ] Content rating
[ ] Store listing describes broader rewards
```

### 13.4 Technical

```
[ ] Wallet ledger append-only + idempotency
[ ] Webhook signature verification
[ ] Webhook replay protection
[ ] RazorpayX IP allowlisting
[ ] RazorpayX idempotency key
[ ] Play Store referrer validation
[ ] Offer approval validates install source
[ ] Reconciliation jobs operational
[ ] Admin RBAC + MFA
[ ] Admin audit logs immutable
[ ] Fraud rules configured
[ ] Backup and restore tested
```

---

## 14. References

| # | Source | URL |
|---|--------|-----|
| 1 | Google Play — User Ratings, Reviews, Installs | https://support.google.com/googleplay/android-developer/answer/9898684 |
| 2 | Google AdMob — Rewarded Ads Policy | https://support.google.com/admob/answer/7313578 |
| 3 | Google Play — Financial Features | https://support.google.com/googleplay/android-developer/answer/13849271 |
| 4 | Google Play — Payments Policy | https://support.google.com/googleplay/android-developer/answer/10281818 |
| 5 | RBI — Draft PPI Directions | https://www.rbi.org.in |
| 6 | MeitY — DPDP Rules 2025 | https://www.meity.gov.in |
| 7 | TRAI — DLT Registration | https://www.trai.gov.in |
| 8 | Razorpay — KYC Documents | https://razorpay.com/docs |
| 9 | RazorpayX — Payouts | https://razorpay.com/docs/payouts |
| 10 | Xoxoday Plum — Rewards API | https://developers.xoxoday.com |
| 11 | Unity / Tapjoy — Offerwall | https://docs.unity.com |
| 12 | ironSource — SDK | https://developers.is.com |
| 13 | AppsFlyer — Postback Macros | https://support.appsflyer.com |
| 14 | Adjust — India Campaigns | https://help.adjust.com |
| 15 | Cashfree — Secure ID | https://www.cashfree.com |
| 16 | Signzy — KYC API | https://docs.signzy.com |
| 17 | Zoho CPaaS — DLT | https://www.zoho.com |
| 18 | Firebase — FCM | https://firebase.google.com |
| 19 | Google Play Install Referrer API | https://developer.android.com/google/play/installreferrer |

---

**Document Status:** Complete implementation blueprint  
**Next Step:** Convert Sections 9–10 into OpenAPI contract and PostgreSQL migration scripts  
**Compliance Review:** Required before production launch
