# Project Memory

## Project

India Rewards Marketplace

## Status

API foundation and initial feature domains are implemented. Neon connection setup is in place, with live migration verification pending local credentials; production data persistence for feature routes is not yet complete.

## Decisions

-   India-only launch.
-   Android app + backend API + web admin.
-   Internal virtual coin currency.
-   Immutable/auditable wallet ledger.
-   UPI/bank cash redemption where provider/business eligibility allows.
-   Gift cards/vouchers through an approved provider.
-   Physical products may support coins + cash.
-   Monetization through approved partner offers, ads, direct campaigns
    and brand deals.
-   Offer completion must be provider-verified.
-   Provider integrations use adapters.
-   Money/reward-changing admin actions are audited.
-   Play Store compliance is a release gate.

## Constraints

No gambling/betting, fake engagement, fake conversions or
policy-bypassing systems. Do not expose provider secrets to clients.
Payment/business accounts must satisfy applicable age, KYC and legal
requirements.

## Current Task

Task 6 --- Admin project and auth foundation.

## To Decide Later

Exact providers, business/legal entity, coin-to-INR economics,
withdrawal minimum, fraud thresholds, product fulfillment and
tax/accounting treatment.

## Change Log

Initial project documentation created.
Repository foundation scaffold created with root workspace, app packages, shared packages, and project documentation index.
Task 1 complete.
Backend environment bootstrap created using a minimal Node API, runtime config, health endpoints, and a working test harness.
Task 2 complete.
Wallet ledger logic implemented with immutable transaction validation, balance derivation, and wallet API endpoints for read/write operations.
Task 11 and Task 12 complete.
Offer domain and API implemented with validation, normalization, eligibility checks, and list/create endpoints for reward offers.
Task 16 and Task 17 complete.
Reward domain and API implemented with referral and offer reward events, status handling, and user reward listing/creation endpoints.
Task 24 complete.
Product catalog and order flow implemented with normalized product creation, coin-plus-cash order rules, and catalog/order endpoints.
Task 30 and Task 31 complete.
Runtime environment loading fixed; API startup now verifies PostgreSQL connectivity. Neon connection templates support a pooled application URL and a direct migration URL.
Task 2 and Task 3 complete. Neon migration `001_init_schema.sql` applied; API connected through the pooled Neon URL and health returned `ok: true`.
Shared domain declarations and strict request parsers added for wallet, offers, rewards, payouts, products, and orders. Order prices and reward approval status are server-controlled inputs.
Task 4 implementation complete and validated.
Product/order routes now enforce the shared product and order parsers; forged order prices and user identity are rejected, and catalog values determine order totals.
Android Kotlin/Jetpack Compose project scaffolded with design.md color/spacing tokens and a starter screen. Android build verification pending because Gradle is unavailable in the environment.
Task 5 scaffold complete; compile verification pending.
Neon migration and pooled API health check verified after local configuration; database connection values remain in ignored local env files.
