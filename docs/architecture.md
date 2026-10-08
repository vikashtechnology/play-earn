# Architecture

## Stack

- **Android:** Kotlin, Jetpack Compose, Coroutines, Firebase Auth SDK (email link, Google, phone OTP), Credential Manager for Google.
- **Auth:** **Firebase Authentication** is the only identity provider. The API verifies Firebase ID tokens server-side against Google's published signing certificates.
- **Backend:** Node.js (ESM, zero framework), REST over `node:http`, JWT-style short-lived platform session tokens.
- **Database:** **Neon PostgreSQL** (serverless Postgres). Pooled connection for the API, direct connection for DDL/migrations.
- **Cache/queue:** Redis (optional today; reserved for rate limits and queues).
- **Admin:** Next.js, TypeScript, Tailwind (scaffold only).
- **Infrastructure:** Neon, Render/Fly/Cloud Run for the API, HTTPS everywhere, CI on GitHub Actions.

## Identity model

```text
Android app
  │  1. Firebase sign-in (email link / Google / phone OTP)
  │  2. Firebase ID token (RS256, ~1h lifetime)
  ▼
API  POST /api/v1/auth/firebase/session
  │  3. Verify signature against Google's securetoken certificates
  │     (iss = https://securetoken.google.com/{projectId}, aud = projectId,
  │      exp/iat/auth_time, sub == user_id, allowed sign-in provider)
  │  4. Provision or refresh the Neon account: users, wallets, user_consents
  │  5. Append a firebase_auth_events audit row
  │  6. Issue a platform API session token (HS256, 15 minutes)
  ▼
Android stores only the API session token (AES/GCM, Android Keystore)
```

Rules:

- The API **never** trusts a client-supplied user id, email, phone, or status. Identity always comes from the verified Firebase token; authorization always comes from the platform session token.
- `anonymous` and `custom` Firebase providers are rejected: every wallet must belong to a verifiable identity. Firebase reports phone auth as `phone` in the ID token and `phone.com` as the provider id; both spellings are normalized, so either may appear in `FIREBASE_ALLOWED_SIGN_IN_PROVIDERS`.
- An account is only created when Firebase attests a **verified** contact point (`email_verified` or `phone_number_verified`). An unverified email — for example an unfinished password sign-up — is rejected with `contact_verification_required`, and no wallet is provisioned.
- New accounts require consent captured against the **currently published** Terms/Privacy versions; stale versions are rejected so an old consent screen cannot be replayed.
- Two Firebase UIDs may never share one email or phone. Ownership is checked **before** any write, so signup, profile refresh, and legacy-row adoption are all guarded; conflicts are rejected and audited rather than merged.
- Minimum KYC for cash payouts requires a Firebase-verified `phone_number` claim on a token belonging to the same account. A phone number supplied in the request body is never trusted — it is only accepted as a cross-check against the token claim. The result is recorded in `users.phone`, `users.phone_verified_at`, `users.minimum_kyc_verified_at`, and `audit_logs`; `payout_kyc_checks` stays reserved for provider KYC (UPI/bank/PAN/Aadhaar).
- Session revocation writes `users.tokens_revoked_before`; every gated request compares its token `iat` against that watermark, and a request whose issue time cannot be determined fails closed.
- Offer reads are filtered in one place: only `active` offers are served, and an `install` offer is served only when its landing URL is a `https://play.google.com/` listing. List and detail views cannot disagree, and a direct id lookup cannot bypass the rule.
- No Firebase secret, service-account key, or SMS/email provider key ships in the APK. The Android app only holds the public `google-services.json`.

## Flow

```text
Android → API → Firebase ID token verification
                    ↓
             Neon PostgreSQL (users, wallets, ledger, offers, orders, payouts, audit)
                    ↓
       Offer / Reward / Payment / SMS / Email provider adapters
```

## Core tables (Neon)

`users`, `wallets`, `wallet_transactions`, `offers`, `offer_events`, `referrals`, `withdrawals`, `reward_products`, `orders`, `audit_logs`, `otp_challenges`, `user_consents`, `payout_kyc_checks`, `firebase_auth_events`.

Migration `005_firebase_auth_identity.sql` adds the Firebase identity columns and audit trail and drops the retired Supabase columns and challenge tables.

## Wallet

The immutable transaction ledger is the source of truth. Cached balances are allowed only as derived state. AdMob coins are tagged by `source_type = 'admob'` and are excluded from cash and gift-card redemption.

## Provider adapters

```text
OfferProvider          → ProviderA / ProviderB
PayoutProvider         → RazorpayX (planned) / FutureProvider
RewardCatalogProvider  → Xoxoday (planned) / FutureProvider
SmsProvider            → Fast2SMS (legacy fallback; Firebase phone auth is primary)
EmailProvider          → Resend (transactional only; Firebase sends verification mail)
IdentityProvider       → Firebase Auth (verified server-side, no SDK dependency)
```

Provider-specific code must not leak into domain logic. Every adapter fails closed: if credentials are missing, the dependent feature reports unavailable instead of silently downgrading.
