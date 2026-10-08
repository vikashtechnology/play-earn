# Architecture

## Stack

-   Android: Kotlin, Jetpack Compose, Coroutines, Retrofit/OkHttp, FCM.
-   Backend: Node.js, TypeScript, REST, PostgreSQL, Redis/queue.
-   Admin: Next.js, TypeScript, Tailwind.
-   Infrastructure: managed database/queue, HTTPS, CI/CD, logs and
    monitoring.

## Structure

``` text
rewards-platform/
├── apps/android/
├── apps/admin/
├── apps/api/
├── packages/shared-types/
├── packages/validation/
├── docs/
└── infrastructure/
```

## Flow

``` text
Android → API → Auth / Offers / Wallet / Rewards / Orders / Payouts / Fraud
                    ↓
             PostgreSQL + Queue
                    ↓
       Offer / Reward / Payment Providers
```

## Core Tables

users, wallets, wallet_transactions, offers, offer_events, withdrawals,
rewards, reward_orders, referrals, campaigns, audit_logs.

## Wallet

The immutable transaction ledger is the source of truth. Cached balances
are allowed only as derived state.

## Provider Adapters

``` text
OfferProvider
 ├── ProviderA
 └── ProviderB
PayoutProvider
 ├── ProviderA
 └── FutureProvider
RewardCatalogProvider
 ├── ProviderA
 └── FutureProvider
```

Provider-specific code must not leak into domain logic.
