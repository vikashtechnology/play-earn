# Project Memory

## Project

India Rewards Marketplace

## Status

Documentation foundation created and cleaned. Production feature implementation has not started.

## Decisions

- India-only launch.
- Android app + backend API + web admin.
- Internal virtual coin currency (earn-only, non-transferable, non-cash-equivalent).
- Immutable/auditable wallet ledger.
- UPI/bank cash redemption where provider/business eligibility allows (KYC required).
- Gift cards/vouchers through an approved provider (Xoxoday etc.).
- Physical products may support coins + cash.
- Monetization through approved partner offers, ads, direct campaigns and brand deals.
- Offer completion must be provider-verified (S2S postbacks).
- All app installs must redirect exclusively to Google Play Store.
- AdMob rewarded ads give only non-monetary in-app coins.
- Provider integrations use adapters.
- Money/reward-changing admin actions are audited.
- Play Store compliance is a release gate.

## Constraints

No gambling/betting, fake engagement, fake conversions or policy-bypassing systems. Do not expose provider secrets to clients. Payment/business accounts must satisfy applicable age, KYC and legal requirements.

## Current Task

Task 1 — documentation/repository foundation (completed with cleaned docs).

## To Decide Later

Exact providers, business/legal entity, coin-to-INR economics, withdrawal minimum, fraud thresholds, product fulfillment and tax/accounting treatment.

## Change Log

- Initial project documentation created.
- 2026-10-06: Cleaned and consolidated full blueprint + free providers + KYC + mistakes + quick reference.
- 2026-10-06: Added 06_Coin_Economy_Rules.md, 07_Fraud_Rules_v1.md, 08_Support_SLA.md. Updated README.
