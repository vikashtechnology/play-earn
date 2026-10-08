# Play & Earn Real Cash

An India-first rewards marketplace for verified offers, surveys, check-ins, brand deals, products, and eligible cash rewards. The offerwall is one earning area, not the app's primary identity.

## Product summary

Users earn virtual coins through verified activities and redeem them for cash payouts, gift cards, or products under compliant, auditable flows.

## Stack

| Layer | Choice |
|---|---|
| Identity | **Firebase Authentication** — email link, Google, phone OTP. The API verifies Firebase ID tokens against Google's published signing certificates. |
| Database | **Neon PostgreSQL** — pooled connection for the API, direct connection for migrations |
| API | Node.js 22 ESM, REST over `node:http`, short-lived HS256 platform session tokens |
| Android | Kotlin + Jetpack Compose, Firebase Auth SDK, Credential Manager |
| Admin | Next.js (scaffold) |
| Email / SMS | Resend (transactional), Fast2SMS (legacy fallback, disabled). Firebase sends verification mail and phone OTPs. |

See [docs/09_Firebase_Neon_Setup.md](docs/09_Firebase_Neon_Setup.md) for the exact configuration the code expects.

## Documentation

- [docs/00_README.md](docs/00_README.md) — documentation index
- [docs/prd.md](docs/prd.md) — product requirements
- [docs/architecture.md](docs/architecture.md) — technical architecture and identity model
- [docs/09_Firebase_Neon_Setup.md](docs/09_Firebase_Neon_Setup.md) — Firebase + Neon configuration, endpoints, pre-launch checks
- [docs/tasks.md](docs/tasks.md) — delivery task plan
- [memory.md](memory.md) — project memory and decisions
- [infrastructure/README.md](infrastructure/README.md) — local services and environment setup
- [ignoreDocs/](ignoreDocs/) — original product notes (brand deals, payouts, compliance, mistakes to avoid)

## Repository structure

```text
play-earn/
├── apps/
│   ├── android/          # Kotlin + Compose app, Firebase Auth
│   ├── admin/            # Next.js scaffold
│   └── api/              # Node REST API, Neon repositories, migrations
├── packages/
│   ├── shared-types/
│   └── validation/       # request parsers shared by API routes
├── infrastructure/
├── docs/
└── memory.md
```

## Current status

- Firebase Auth is the only identity provider: server-side ID token verification, consent-aware account provisioning, Minimum-KYC phone verification, and session revocation are implemented with tests.
- Neon holds users, wallets, consents, Minimum-KYC state, the authentication audit trail, home balances, and featured offers.
- `GET /api/v1/home` and `GET /api/v1/profile` are wired into the API and consumed by the Android app.
- Auth and identity flows are fail-closed: sign-in stays disabled until a Firebase project and reviewed policy URLs/versions are configured.
- Offers, rewards, products, orders, and payout **write** routes still use in-memory stores (task 9). Cash payouts stay disabled pending KYC and provider work.

## Quick start

```sh
npm install
cp apps/api/.env.example apps/api/.env       # set Neon + Firebase values
npm --workspace @rewards-platform/api run migrate
npm run dev:api                              # http://localhost:4000/api/health
npm test                                     # 122 unit, route, and SQL tests — no database needed
npm run build                                # syntax + migration checks
npm --workspace @rewards-platform/api run smoke:identity   # against real Neon
```

`npm test` covers three layers without any external service: domain and route unit tests, request-schema tests, and `src/db/repository.integration.test.js`, which applies every migration and exercises the real repository SQL against `pg-mem` (an in-memory PostgreSQL emulator). The emulator implements a subset of PostgreSQL, so `scripts/smoke-identity.js` against real Neon remains the authoritative pre-launch check.

Android: open `apps/android` in Android Studio, replace `app/google-services.json` with the real Firebase config, and build with `-PAPI_BASE_URL`, `-PGOOGLE_WEB_CLIENT_ID`, and `-PEMAIL_LINK_URL`.

## Working rules

- One task at a time from [docs/tasks.md](docs/tasks.md)
- Money-changing flows must be ledgered, auditable, and validated at API boundaries
- Identity comes only from verified Firebase tokens; clients never choose their own user id, email, phone, or status
- An account needs a Firebase-**verified** email or phone, and cash payouts need a Firebase-verified phone claim on the same account — never a phone number sent in a request body
- Anonymous and custom Firebase sign-ins are rejected: every wallet needs a verifiable identity
- No provider secret may ship in the Android APK
- Compliance review is part of product readiness
