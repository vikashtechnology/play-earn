# Play & Earn Real Cash — India Rewards Marketplace Documentation

**Market:** India-first, Android + Web Admin  
**Model:** Rewards + offers + brand marketplace

## 📂 Files

| File | Purpose |
|------|---------|
| `01_Complete_Implementation_Blueprint.md` | Full product, tech, legal, and operations blueprint |
| `02_Mistakes_To_Avoid.md` | Critical mistakes to never make (compliance, Play Store, fraud) |
| `03_Free_Providers.md` | Zero-cost starter stack for MVP |
| `04_Why_KYC_Is_Required.md` | RBI regulation explanation for PAN/Aadhaar verification |
| `05_Quick_Reference.md` | Deadly sins + pre-launch checklist + emergency contacts |
| `06_Coin_Economy_Rules.md` | Coin sources, lifecycle, limits, expiry, redemption rules |
| `07_Fraud_Rules_v1.md` | Starting fraud signals, risk score, device & payout controls |
| `08_Support_SLA.md` | Support priorities, SLAs, escalation, templates |
| `09_Firebase_Neon_Setup.md` | Firebase Auth + Neon configuration, auth endpoints, pre-launch checks |
| `prd.md` | Product requirements (short) |
| `architecture.md` | Stack, structure, wallet, provider adapters |
| `memory.md` | Project decisions and status |

## ⚠️ Critical Positioning

This app is a **rewards marketplace**, NOT an "install apps for money" app.

- Offerwall is **one module** among surveys, check-ins, brand deals, coupons, and products.
- **AdMob revenue** belongs entirely to the platform owner. Users receive only non-monetary, in-app coins for watching rewarded ads.
- **All app/game installs must redirect exclusively to Google Play Store.** No third-party APK sources.
- **Cash payouts require KYC** (PAN, Aadhaar, bank verification) as per RBI guidelines.
- **Firebase Authentication** is the only identity provider; **Neon PostgreSQL** is the only database. The API verifies Firebase ID tokens server-side and never trusts client-supplied identity.

## 🚀 Quick Start

1. Read `01_Complete_Implementation_Blueprint.md` for full context.
2. Review `02_Mistakes_To_Avoid.md` before every release.
3. Use `03_Free_Providers.md` to build your MVP at near-zero cost.
4. Understand `04_Why_KYC_Is_Required.md` before implementing cash withdrawals.
5. Keep `05_Quick_Reference.md` handy during development and launch.
6. Implement coin logic strictly per `06_Coin_Economy_Rules.md`.
7. Apply fraud controls from `07_Fraud_Rules_v1.md`.
8. Operate support using `08_Support_SLA.md`.
9. Configure Firebase and Neon exactly as described in `09_Firebase_Neon_Setup.md`.

## 📞 Compliance Reminder

This is not legal advice. Consult a qualified lawyer/CA before launch.
