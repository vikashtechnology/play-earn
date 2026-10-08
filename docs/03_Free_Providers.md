# 🆓 Free Providers — India Rewards Marketplace App

**Version:** 1.0 | **Date:** 2026-10-06  
**Purpose:** Zero-cost starter stack for MVP.

> **Note:** Free tiers have limits. Check current terms before scaling.

---

## 1. SMS / OTP (India, DLT-Compliant)

| Provider | Free Tier | DLT Support |
|----------|-----------|-------------|
| Fast2SMS | ₹50 free credits | ✅ Free DLT support |
| SMSLocal | ₹60 free (~200 SMS) | ✅ DLT compliant |
| SMSGatewayHub | Free signup | ✅ DLT-compliant |
| MessageBot | 100 SMS free trial | ✅ DLT integration |

**Recommended:** Fast2SMS or SMSLocal

---

## 2. Push Notifications

| Provider | Free Tier |
|----------|-----------|
| Firebase Cloud Messaging | Unlimited, free forever |
| ntfy.sh | Free, unlimited, open-source |
| OpenNotify | Self-hosted, free |
| OneSignal | Free tier available |

**Recommended:** FCM

---

## 3. KYC / Identity Verification

| Provider | Free Tier |
|----------|-----------|
| Eko (EPS) | Self-serve UAT/sandbox |
| CKYC.ai | 500 free API calls |
| Sandbox.co.in | Free sandbox |
| Perfios | 10,000 free credits |
| Setu KYC | Free tier, no form |
| Decentro | Free sandbox |

**Recommended:** Sandbox.co.in or Setu KYC

---

## 4. Payment Gateway (Incoming)

| Provider | Free Tier |
|----------|-----------|
| Razorpay | Free sandbox |
| Cashfree | Free sandbox |
| CCAvenue | Sandbox built-in |
| Instamojo | Test mode free |
| Juspay | Free tier provisioning |

**Recommended:** Razorpay sandbox

---

## 5. Payout APIs (Outgoing)

| Provider | Free Tier |
|----------|-----------|
| RazorpayX | Test mode free |
| Cashfree Payouts | Sandbox free |
| Sandbox.co.in | Free sandbox |
| KwikPaisa | Sandbox |
| Zeta | Sandbox by request |

**Recommended:** RazorpayX test mode

---

## 6. Gift Card / Rewards Catalog

| Provider | Free Tier |
|----------|-----------|
| Xoxoday Plum | Free staging environment |
| Reloadly | Free sandbox |
| Budgetree | Sandbox by request |
| Tremendous | Free tier |
| FreeGiftZone | Free API, no auth |

**Recommended:** Xoxoday Plum staging

---

## 7. Offerwall SDKs

| Provider | Free Tier |
|----------|-----------|
| RapidoReach | Free SDK integration |
| RewardingHub | Free SDK for publishers |
| Tyrads | Open-source SDK |
| Youmi | Free Android SDK |

**Recommended:** RapidoReach (surveys) + RewardingHub (CPI/CPE)

---

## 8. Mobile Attribution SDKs

| Provider | Free Tier |
|----------|-----------|
| ByteBrew | Free all-in-one |
| Katyayani Core | Free Flutter SDK |
| LinkTrail | Open-source |
| LinkForty | Open-source, self-hosted |
| 2tag | Free React Native SDK |
| WarpLink | Free forever |

**Recommended:** ByteBrew or Katyayani

---

## 9. Database (PostgreSQL)

| Provider | Free Tier | India Region? |
|----------|-----------|---------------|
| Neon (chosen) | 0.5 GB, 100 compute-hours | ❌ (region choice available) |
| Render | Free for 90 days | ❌ |
| AWS Aurora | AWS Free Tier | ✅ Mumbai |

**Chosen:** Neon PostgreSQL for the MVP (pooled connection for the API, direct connection for migrations); revisit AWS Aurora Mumbai if data residency becomes a requirement.

**Not used:** Supabase. Authentication is Firebase (free Spark tier: 50K monthly active users, unlimited email/Google sign-in, 10 SMS verifications per project per day on the free tier — a paid plan is needed for real phone OTP volume).

---

## 10. Redis (Cache)

| Provider | Free Tier |
|----------|-----------|
| Upstash | Free 30 MB, no signup |
| Redis Cloud | Free 30 MB |

**Recommended:** Upstash

---

## 11. S3-Compatible Storage

| Provider | Free Tier | India Region? |
|----------|-----------|---------------|
| QuixiCloud | 10 GB free | ✅ |
| ZATA.AI | Free tier | ✅ |
| Stornox | Free tier | ✅ |
| AWS S3 | 5 GB for 12 months | ✅ Mumbai |
| Backblaze B2 | 10 GB free | ❌ |

**Recommended:** QuixiCloud or ZATA.AI

---

## 12. Monitoring / Error Tracking

| Provider | Free Tier |
|----------|-----------|
| PostHog | 100K errors/month |
| Rollbar | 5K events/month |
| GlitchTip | Open-source, self-hosted |
| Bugsink | Open-source |
| Tindra | Open-source |
| Healthchecks.io | 20 checks free |

**Recommended:** PostHog or GlitchTip

---

## 13. CI/CD

| Provider | Free Tier |
|----------|-----------|
| GitHub Actions | 2,000 min/month private |
| GitLab CI/CD | Free minutes |
| CircleCI | 400K credits open source |
| Azure Pipelines | Free open source |
| Drone CI | Open-source |
| Woodpecker CI | Open-source |

**Recommended:** GitHub Actions

---

## 14. Secret Management

| Provider | Free Tier |
|----------|-----------|
| SLV | Open-source |
| Tene | Free locally |
| TinyVault | Free, single binary |
| Keyr | Free, self-hosted |
| DevAssets | Free, MIT |
| Cottage | Free, GitOps |

**Recommended:** TinyVault or SLV

---

## 15. Recommended Free Stack for MVP

```text
SMS/OTP:        Fast2SMS (₹50 free) + free DLT registration
Push:           Firebase Cloud Messaging (unlimited)
KYC:            Sandbox.co.in (free sandbox)
Payment:        Razorpay sandbox (free test mode)
Payout:         RazorpayX sandbox (free test mode)
Gift Cards:     Xoxoday Plum staging (free)
Offerwall:      RapidoReach (free SDK)
Attribution:    ByteBrew (free all-in-one)
Database:       Neon PostgreSQL (0.5 GB free)
Auth:           Firebase Authentication (Spark free tier)
Redis:          Upstash (30 MB free)
Storage:        QuixiCloud (10 GB free, India)
Monitoring:     PostHog (100K errors/month free)
CI/CD:          GitHub Actions (2,000 min/month free)
Secrets:        TinyVault (free, local)
Total cost to build and test MVP: ₹0
```

---

## 16. When to Upgrade

```text
[ ] SMS: Paid plan after credits exhausted
[ ] KYC: Production after sandbox testing
[ ] Payment: Razorpay live after KYC
[ ] Payout: RazorpayX live after KYC
[ ] Gift Cards: Fund Xoxoday for live redemption
[ ] Database: AWS Aurora PostgreSQL (Mumbai) for India data residency
[ ] Redis: Upgrade for higher throughput
[ ] Storage: Upgrade for more GB
[ ] Monitoring: Upgrade for higher volume
[ ] Secrets: AWS Secrets Manager for production
```

---

## 17. Compliance Reminders

| Provider | Requirement |
|----------|-------------|
| Fast2SMS / SMSLocal | DLT registration mandatory |
| Razorpay / RazorpayX | KYC mandatory for live |
| Xoxoday | Company registration for live |
| Offerwall | Configure Play Store-only installs |
| Attribution | Validate Play Store referrer |
| Any | Never store secrets in APK/source |

---

## 18. Email Verification Providers (OTP & Transactional Email)

For account creation and OTP via email, use a dedicated transactional email provider. **Never** use marketing email services for OTPs — a single spam complaint can break your signup flow.

### Top Providers Comparison

| Provider | Best For | Free Tier | India‑Specific Advantage | Watch Out For |
|----------|----------|-----------|--------------------------|---------------|
| **Zoho ZeptoMail** | **Fintech‑grade OTPs in India** | 10,000 free email credits (one‑time) | Data stored in Indian data centres. Built by Zoho, a trusted Indian company. | Free credits are one‑time, not monthly. |
| **Resend** | **MVP & Developer Experience** | 3,000 emails/month (100/day) | Clean API, 90‑second setup. Great for quick testing. | May not have the same India‑specific data residency focus. |
| **SendGrid** | **Enterprise‑grade reliability** | 100 emails/day | Proven deliverability at scale, good for growth. | More expensive as you scale. India‑focused support may be limited. |
| **Brevo (formerly Sendinblue)** | **Generous free tier** | 300 emails/day (9,000/month) | Good balance of free volume and reliability. | UI can feel cluttered. Not India‑specific. |
| **AWS SES** | **Lowest cost at massive scale** | 3,000 messages/month for 12 months | **ap‑south‑1 (Mumbai) data residency** for DPDP compliance. Cheapest at scale (~₹85/mo for 10k emails). | Complex setup (bounce handling, SNS/SQS). Not for beginners. |
| **MSG91** | **All‑in‑one India communications** | Free version available | India‑based with **built‑in DLT compliance**. Handles SMS, email, WhatsApp, voice from one dashboard. | Email isn't their core focus, but integration is convenient. |

### Recommended Strategy for Your App

**For MVP (Testing Phase):**
- Start with **Resend**. Free tier (3,000 emails/month, 100/day) is perfect for development and initial user testing. Setup is extremely fast.

**For Production (Launch):**
- Move to **Zoho ZeptoMail**. Reasons:
  - **India Data Residency** – stores data in Indian data centres (DPDP compliance).
  - **Fintech‑Grade Focus** – built specifically for high‑priority transactional emails (OTPs, password resets, alerts).
  - **Proven Reliability** – real‑world case study: Alice Blue (Indian stockbroker) reduced email costs by 73% after migrating to ZeptoMail.

**Long‑Term Play:**
- If you already use **MSG91** for SMS, consider using their email service too. One vendor for all communication (SMS, email, WhatsApp) simplifies management, though deliverability may not match dedicated providers.

### ⚠️ Critical Reminder

Email verification is for **account creation only**. For **cash payouts**, RBI regulations still require a **mobile number verified via OTP** (Minimum KYC). Your flow should be:
1. **Signup:** Email verification (using any of the above providers).
2. **Cash Withdrawal:** Prompt for phone OTP verification before allowing the transaction.

### Implementation Notes

- **Use dedicated infrastructure:** Never send OTP emails from the same domain/IP pool as marketing emails.
- **Strict expiry:** Email OTPs should expire in 5–10 minutes.
- **Validate email authenticity:** Use email validation APIs to block disposable/invalid addresses.
- **Monitor deliverability:** Set up bounce and spam complaint handling. Remove hard bounces immediately.
- **Rate limiting:** Throttle OTP requests per email/IP to prevent abuse.

---