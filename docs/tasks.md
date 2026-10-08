# Zivora — Build Tasks

This plan supersedes the earlier generic task list and follows the current PRD, implementation blueprint, coin economy, fraud, KYC, and support documents. Complete one numbered task at a time and update this file and `memory.md` at each milestone.

## Verified Progress

- [x] Repository, documentation, workspace, and initial API foundation.
- [x] **Neon PostgreSQL is the only database**: pooled URL for the API, direct URL for migrations, enforced TLS verification, migrations `001`–`005` ready, and API health verified against Neon.
- [x] Shared domain declarations and request validation for wallets, offers, payouts, rewards, products, and orders.
- [x] Product order route rejects client-supplied identity/prices and calculates costs from catalog.
- [x] Install offers require a Google Play Store listing URL.
- [x] Android Compose project scaffold, brand name, design token mapping, and API 36 target.
- [x] Android navigation shell for Home, Earn, Rewards, Wallet, and Profile; signed-out balance states and AdMob-only coin messaging are separated.
- [x] OTP challenge schema applied on Neon; OTP API validates Indian phone numbers, stores only hashes, throttles attempts, expires challenges, and issues a short-lived phone-verification token. Kept as a gated Fast2SMS fallback now that Firebase phone auth is primary.
- [x] Android OTP phone/code UI, resend/expiry states, API client, and Android Keystore-backed token storage.
- [x] **Firebase Auth replaced Supabase end to end**: zero-dependency RS256 ID token verification against Google's securetoken certificates (issuer, audience, expiry, issued-at, auth-time, subject consistency, certificate caching, one refresh on key rotation, `alg=none` rejection), allowed-provider enforcement, and no service-account key required.
- [x] Versioned consent capture enforced server-side: new accounts must echo the exact published Terms/Privacy versions, optional analytics and personalization choices are stored separately, and stale consent screens are rejected.
- [x] Firebase session exchange provisions user + wallet + consents in one Neon transaction, refuses accounts without a verified email or phone, refuses email/phone collisions between two Firebase UIDs, throttles repeated exchanges, and appends every outcome to `firebase_auth_events`.
- [x] Cash withdrawals require a signed session plus Firebase-verified phone Minimum KYC bound to the same account; session revocation writes a watermark that the payout and session gates enforce against token `iat`.
- [x] Android Firebase flows: email link sign-in with encrypted pending-consent storage, Google via Credential Manager, phone OTP Minimum KYC with instant-verification support, silent session re-exchange on launch, and sign-out with server-side revocation.
- [x] Repository SQL is regression-tested: migrations and every identity/wallet/offer query run against an in-memory PostgreSQL emulator, covering provisioning, contact uniqueness, Minimum KYC, revocation, coin buckets, and Play-Store-only offer filtering.
- [x] `/api/v1/home` and `/api/v1/profile` are routed and Neon-backed (coin buckets with AdMob coins separated, Play-Store-only featured offers, profile, consent versions, payout state) and consumed by the Android Home/Wallet/Profile screens.
- [x] Neon identity smoke rewritten for Firebase: account/wallet/consent creation, duplicate and takeover protection, Minimum-KYC persistence, revocation watermark, and auth event counters; synthetic records are deleted afterwards.
- [x] Important cross-cutting feature and release requirements documented.
- [x] `docs/09_Firebase_Neon_Setup.md` documents the exact Firebase and Neon configuration, auth endpoints, error codes, and pre-launch checks.

## Current Task

5. [ ] Earn and offers: survey/check-in/brand sections, offer detail and statuses, missing-reward support link, Play Store-only install handoff — and moving the offer/reward/product/order/payout write routes from in-memory Maps to Neon repositories (task 9), which the Earn screens depend on.

Configuration gate still open: a real Firebase project (`google-services.json`, authorized email-link domain, Phone/Google/Email-link providers enabled), Neon connection strings, and reviewed public Terms/Privacy URLs with versions. Until those exist, `firebaseSignInEnabled` is `false` and the session endpoint returns `503`.

## Android MVP

3. [x] Signup and phone verification with Firebase: email link sign-in, Google sign-in, code/resend UI, encrypted session and pending-consent storage, and withdrawal Minimum KYC implemented. [ ] Configure the real Firebase project, authorized email-link domain, and reviewed policy links before enabling.
4. [x] Home and profile: Neon-backed balance buckets, featured offers, profile details, referral entry, consent versions with refresh prompt, preferences, support contacts, and sign-out. [ ] Ledger history and account deletion views still pending (tasks 6 and 7).
5. [ ] Earn and offers: survey/check-in/brand sections, offer detail and statuses, missing-reward support link, Play Store-only install handoff.
6. [ ] Rewards and wallet: separate coin sources and balances; pending/available/reserved/reversed states; ledger history.
7. [ ] Account deletion: in-app path, confirmation, API workflow, and public web deletion instructions.
8. [ ] Android API client: HTTPS configuration, typed DTOs, request/error handling, session storage, and no provider secrets in APK.

## API and Data

9. [ ] Move API feature routes from in-memory Maps to PostgreSQL repositories and transactions.
10. [ ] Expand schema for user profiles, devices, consent, KYC, coin source, idempotency, expiries, reservations, conversions, campaigns, fraud, support, and webhook events.
11. [x] Firebase Auth integration: ID token verification, consent-aware provisioning, phone Minimum KYC, session revocation, auth audit trail, and rate limits. Legacy OTP endpoints retained as a gated fallback. [ ] Configure the real Firebase project and reviewed policies before enabling live signup.
12. [ ] Implement append-only coin ledger; source-tag every entry; enforce idempotency and atomic reserve/commit/release/reversal.
13. [ ] Enforce AdMob coins as in-app-only and block them from cash/gift-card redemption.
14. [ ] Add signed, replay-safe, idempotent S2S callbacks; validate install referrer and click ID before crediting.
15. [ ] Implement configurable approval windows, earn/redemption limits, and coin expiry; never hard-code production economics.
16. [ ] Add KYC status/tier checks, payout eligibility, provider idempotency, and reconciliation before enabling cash withdrawal.
17. [ ] Implement product checkout with coin reservation, Razorpay payment verification, and fulfillment state machine.

## Admin and Operations

18. [ ] Admin web app with secure sign-in, short-lived sessions, MFA-ready boundary, and no client-side secrets.
19. [ ] RBAC for Super Admin, Operations, Finance, Marketing, Support, Risk, and Analyst.
20. [ ] Review queues for offers, rewards, withdrawals, fraud, orders, and support.
21. [ ] Immutable admin audit log with actor, target, reason, and before/after hashes; dual authorization for sensitive balance adjustments.
22. [ ] Campaign, brand, catalog, reporting, finance, and CMS workflows.
23. [ ] Support ticket API and user views matching `docs/08_Support_SLA.md`; add escalation and grievance contact management.

## Release Gates

24. [ ] Rate limits, webhook signatures/replay protection, fraud rules, device controls, and risk holds.
25. [ ] Provider adapters and sandbox tests for OTP, offerwall, KYC, payouts, gift cards, payments, and notifications.
26. [ ] Structured monitoring, alerts, backups, restore rehearsal, reconciliation jobs, and incident response plan.
27. [ ] Legal/CA review for coins, KYC, cashout, DPDP, tax, GST/TDS, consumer terms, and grievance obligations.
28. [ ] Google Play policy review, Financial features declaration, Data Safety disclosures, deletion URL, Android API 36 validation, VAPT, and closed testing.
29. [ ] Production release only after security, provider, compliance, and operational gates pass.

## Build Notes

- `npm test` runs 122 API tests plus 10 validation tests with no external service: domain/route unit tests, schema tests, and a repository integration suite that applies migrations `001`–`005` and executes the real SQL against the `pg-mem` in-memory PostgreSQL emulator (a `devDependency` of `@rewards-platform/api`). The emulator lacks some PostgreSQL features, so `smoke:identity` against Neon is still the authoritative check.
- Android Gradle compilation is pending because no JDK/Gradle exists in the current environment. `app/google-services.json` is a committed placeholder so the project still configures; replace it with the real Firebase file before testing auth on a device.
- Firebase phone OTP volume beyond the free tier requires a Blaze plan; keep Minimum KYC disabled in production until that is decided.
- Server-side Firebase ID token verification needs no service-account key. Add one only for Admin operations such as provider-side token revocation or user deletion.
- Admin Next.js dependencies could not be installed because package fetches stalled; do not claim the admin build passes until dependencies install and tests run.
- Cash payouts remain disabled until KYC and qualified legal/provider review are complete.
- Firebase sign-in is disabled until `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_ENABLED=true`, `SIGNUP_ENABLED=true`, and reviewed Terms/Privacy URLs/versions are configured; legacy Fast2SMS phone delivery is disabled until credentials and DLT templates are approved.
- Never claim guaranteed income. AdMob rewarded ads grant in-app-only coins; cash/gift-card rewards come only from verified eligible campaigns.
