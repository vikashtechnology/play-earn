# Project Memory

## Project

India Rewards Marketplace — Play & Earn Real Cash

## Stack (fixed decisions)

- **Auth: Firebase Authentication** (email link, Google, phone OTP). Server-side ID token verification against Google's published signing certificates; no Supabase, no third-party auth.
- **Database: Neon PostgreSQL** (pooled URL for the API, direct URL for migrations). No other primary datastore.
- Android (Kotlin/Compose) + Node REST API + Next.js admin scaffold.

## Status

Firebase Auth replaced the Supabase integration end to end: server-side ID token verification, consent-aware account provisioning, Minimum-KYC phone verification, session revocation, and an append-only authentication audit trail in Neon. `GET /api/v1/home` and `GET /api/v1/profile` are wired into the API and consumed by the Android app with Neon-backed balances, featured offers (with a Play Store handoff), profile, consent, and payout state.

The identity and marketplace SQL has now been executed, not just written: migrations `001`–`005` apply and the full identity flow runs end to end against an in-memory PostgreSQL emulator with a genuinely signed RS256 Firebase token. That exercise found and fixed four real defects (see Change Log). All 122 API tests and 10 validation tests pass with no external service; `smoke:identity` against real Neon is still the authoritative pre-launch check. Signup and phone delivery stay fail-closed until a Firebase project, reviewed policy URLs/versions, and Neon connection strings are configured. The Android app has never been compiled — no JDK or Gradle exists in this environment.

## Decisions

-   India-only launch.
-   Android app + backend API + web admin.
-   Firebase Auth is the only identity provider; the API issues its own 15-minute HS256 session tokens and never trusts client-supplied identity.
-   Anonymous and custom Firebase tokens are rejected: every wallet must belong to a verifiable identity.
-   Neon PostgreSQL is the only database; TLS is enforced for Neon hosts.
-   Internal virtual coin currency.
-   Immutable/auditable wallet ledger; AdMob coins are in-app-only and excluded from cash redemption.
-   UPI/bank cash redemption where provider/business eligibility allows.
-   Gift cards/vouchers through an approved provider.
-   Physical products may support coins + cash.
-   Monetization through approved partner offers, ads, direct campaigns and brand deals.
-   Offer completion must be provider-verified.
-   Provider integrations use adapters that fail closed.
-   Money/reward-changing admin actions are audited; authentication events are audited too.
-   Consent is versioned: the client must echo the exact Terms/Privacy versions it displayed.
-   Two Firebase UIDs may never share one email or phone; conflicts are rejected, not merged, and ownership is checked before any write.
-   Only a Firebase-attested contact counts: an unverified email cannot create an account, and a phone number sent in a request body can never grant Minimum KYC.
-   Offer visibility is decided in one place, so list and detail views cannot disagree and no sideload URL can be served.
-   Play Store compliance is a release gate.

## Constraints

No gambling/betting, fake engagement, fake conversions or policy-bypassing systems. Do not expose provider secrets to clients. Payment/business accounts must satisfy applicable age, KYC and legal requirements. Never claim guaranteed income.

## Current Task

Next task — Earn and offers (task 5) and moving offer/reward/product/order/payout write routes from in-memory Maps to Neon repositories with transactions (task 9). Firebase auth and Neon-backed home/profile are complete pending real credentials.

## To Decide Later

Exact providers, business/legal entity, coin-to-INR economics, withdrawal minimum, fraud thresholds, product fulfillment, tax/accounting treatment, and whether a Firebase service account is needed for Admin operations (token revocation, user deletion).

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
Android Kotlin/Jetpack Compose project scaffolded with design.md color/spacing tokens, `Play & Earn Real Cash` branding, a marketplace-first starter screen, and API 36 target. Android build verification pending because Gradle is unavailable in the environment.
Task 5 scaffold complete; compile verification pending.
Added navigable Home, Earn, Rewards, Wallet, and Profile tabs with signed-out states, marketplace-first content, and separate in-app-only AdMob coin messaging.
Added 18+ self-declaration guest gate, under-18 blocked state pending parental verification, separate optional consent preview switches, and delayed-notification messaging. Consent is session-only and account creation remains unavailable until approved policies and server-side consent storage are implemented.
Added PostgreSQL OTP challenges storing phone/code/IP hashes, phone/IP throttling, five-attempt lockout, five-minute expiry, single-use verification, and a short-lived onboarding-only JWT. Android has OTP entry, resend/expiry feedback, API client, and encrypted token storage. OTP delivery is disabled pending a real SMS provider adapter.
OTP migration was applied to Neon; a synthetic challenge insert/verify/delete smoke test passed.
Added Fast2SMS provider adapter with a hard delivery gate, request timeout, India number validation, and provider-failure tests. Real SMS remains disabled until DLT/provider credentials are configured.
Added email code signup with one-time app-link fallback, verified Google ID-token/JWKS validation with single-use nonces, versioned consent storage, and Android Credential Manager integration. Added user-bound phone OTP Minimum KYC and a signed-session cash withdrawal gate. Identity/consent/nonce/phone verification smoke passed against Neon and cleaned up its synthetic records.
Final Neon smoke verified email user/wallet/consent creation, Google nonce single-use behavior, and transactional phone Minimum-KYC timestamps; test identity and nonce were removed afterward. Signup/SMS features remain disabled until real providers, DLT, OAuth, and reviewed public policy URLs are configured.
Neon migration and pooled API health check verified after local configuration; database connection values remain in ignored local env files.
Offer creation now rejects install offers that do not target Google Play Store, with route and shared validation coverage.
Repository contents extracted from `app.zip` into the working tree, line endings normalized to LF, and `.gitattributes` added so the whole project is version-controlled.
**Switched authentication from Supabase to Firebase Auth.** Added a zero-dependency Firebase ID token verifier (`services/firebaseAuth.js`) that validates RS256 signatures against Google's securetoken certificates, checks issuer/audience/expiry/issued-at/auth-time/subject consistency, caches certificates, refreshes once on key rotation, rejects `alg=none` and anonymous/custom providers, and maps every failure to a public-safe message. Added an optional Identity Toolkit REST client for read-only account lookups. Removed `services/supabaseAuth.js`, `services/googleIdentity.js`, and the Supabase email-code/link and Google-nonce flows.
**Identity domain rewritten around Firebase.** `exchangeFirebaseSession` verifies the token, enforces allowed providers, throttles repeated exchanges per UID and rejected attempts per hashed IP, requires consent with exact published policy versions for new accounts, refuses accounts with no verified email or phone, provisions users/wallets/consents in one Neon transaction, audits every outcome, and issues a 15-minute platform token. `verifyWithdrawalPhone` accepts only a Firebase ID token whose verified `phone_number` belongs to the same account. `revokeSessions` writes a revocation watermark that the payout and session gates enforce against token `iat`.
**Neon migration `005_firebase_auth_identity.sql`** adds `firebase_uid` (unique), `sign_in_provider`, `photo_url`, `adult_self_declared_at`, `last_sign_in_at`, and `tokens_revoked_before`, creates the append-only `firebase_auth_events` audit table with fraud-window indexes, and drops the retired Supabase columns plus the email-challenge and Google-nonce tables. `db.js` now forces TLS certificate verification for Neon hosts, and the migration runner reuses that setting on the direct connection.
**Auth routes replaced.** New endpoints: `POST /api/v1/auth/firebase/session`, `GET /api/v1/auth/session`, `POST /api/v1/auth/session/revoke`, and `POST /api/v1/auth/withdrawal/phone/verify`; `GET /api/v1/auth/policies` now reports Firebase capabilities, allowed providers, and the minimum age without exposing configuration. Legacy Fast2SMS OTP endpoints remain as a gated fallback and are now actually wired to the Fast2SMS adapter. Errors carry stable codes (`consent_required`, `stale_policy_version`, `account_conflict`, `identity_rate_limited`, `phone_verification_required`, `account_not_active`, `firebase_unavailable`) and unexpected failures return generic 500s.
**Home and profile are API-backed.** `/api/v1/home` and `/api/v1/profile` were unreachable before; they are now routed and read from Neon through new `walletRepository` (coin buckets with AdMob coins separated) and `offerRepository` (Play-Store-only install offers), plus the identity service for profile, consent versions, and payout state.
**Android moved to Firebase Auth.** Added the google-services plugin, Firebase BoM, `firebase-auth`, and coroutines play-services; a placeholder `google-services.json`; and manifest intent filters built from `EMAIL_LINK_URL`. New `FirebaseAuthClient` (email link, Google credential, phone verification with instant-verification support, forced token refresh, friendly error mapping), `ConsentRecord` with encrypted pending-signup storage, rewritten `AuthApi`, rewritten `SignupScreen`, `PhoneVerificationScreen` replacing the old OTP sign-in screen, silent session re-exchange on launch, sign-out with server-side revocation, and API-backed Home/Wallet/Profile screens.
**Docs and configuration updated** for Firebase + Neon: `docs/architecture.md`, new `docs/09_Firebase_Neon_Setup.md`, `infrastructure/README.md`, `apps/android/README.md`, root `README.md`, `docs/03_Free_Providers.md`, `docs/00_README.md`, both `.env.example` files, and `docker-compose.yml` (Firebase pass-through and optional Neon override). The identity smoke script was rewritten for Firebase and Neon. Stale TypeScript stubs that referenced Supabase and unavailable dependencies were removed.
Tests: 13 Firebase verifier tests (including x509 certificate maps, key rotation, algorithm confusion, and claim validation), 16 identity domain tests, 12 auth route tests, plus updated config, migration, home/profile, app, and validation tests. The npm test glob was quoted so root-level test files actually run. 117 tests pass; Android compilation is still unverified because no JDK/Gradle exists in this environment.
**Validated the identity SQL against a real Postgres-compatible engine.** Docker and Neon are unavailable in this environment, so the API's repository layer was exercised against `pg-mem` (in-memory PostgreSQL emulator) with all five migrations applied, plus an end-to-end run of the real domain service using an RS256 token signed by an openssl-generated certificate served through a fake securetoken endpoint. This is now a permanent part of the suite as `src/db/repository.integration.test.js` (`pg-mem` added as an API `devDependency`), with emulator shims for `gen_random_uuid`, `hashtext`, `pg_advisory_xact_lock`, `abs`, and `split_part`.
**Fixed four real defects the emulator and end-to-end run exposed.** (1) `upsertFirebaseUser` only checked email/phone ownership on the *new account* path, so a returning sign-in or legacy-row adoption could take over a phone already owned by another account — ownership is now checked before any write, for every path. (2) `verifyWithdrawalPhone` fell back to a client-supplied `phone` when the token had no phone claim, which would have granted cash-payout KYC from a request body; it now requires `phone_number_verified: true` in the token and treats a body phone only as a cross-check (digits compared, mismatch rejected). (3) `normalizeFirebaseIdentity` never mapped `phone_number_verified`, so `phoneVerified` was always undefined, and Firebase reports phone auth as `sign_in_provider: "phone"` rather than `"phone.com"` — both would have broken phone sign-in and Minimum KYC in production; the claim is now mapped and provider spellings are normalized on both the identity and the configured allowlist. (4) `assertSessionUsable` silently skipped the revocation check when `issuedAt` was not a number, failing open; it now accepts epoch seconds, a `Date`, or an ISO string and rejects when the issue time cannot be determined.
**Tightened account creation and offer serving.** A new `ContactVerificationRequiredError` (`contact_verification_required`, HTTP 400) rejects accounts whose email or phone Firebase has not verified, and account creation now requires a *verified* contact rather than any contact. `offerRepository.findById` applies the same servability rule as the list view (active only, install offers only from `https://play.google.com/`) so a direct id lookup cannot bypass the marketplace rules, and offers now expose `installTarget`. Featured offers on `/api/v1/home` carry `installTarget` and `landingUrl`.
**Android home feed is actionable.** `FeaturedItem` parses `id`, `kind`, `installTarget`, and `landingUrl`; approved install offers open the Play Store app (`com.android.vending`) with a browser fallback, and any non-Play-Store URL is ignored so the client can never be pointed at a third-party APK. All Kotlin files pass a structural balance check, but the app still has not been compiled.
**Schema and query portability cleanups.** Removed the redundant partial `idx_users_phone` index (users.phone is already UNIQUE, and PostgreSQL allows many NULLs there), rewrote `markMinimumKycVerified` as an explicit ownership check plus a guarded UPDATE with the UNIQUE constraint as backstop and `23505` handled, replaced interval multiplication with a DB-clock interval cast that works on both engines, stopped writing a misleading `upi` row into `payout_kyc_checks` for phone Minimum KYC (audit log only), and made `provisionUser` return the verification timestamps the session minter reads.
Tests: 122 API tests pass (Firebase verifier, identity domain, auth routes, home/profile, config, migrations, app, and the new repository integration suite) plus 10 validation tests. `npm run build` reports `API_BUILD_OK (48 source files validated)` with 5 migrations.
