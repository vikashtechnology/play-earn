# Firebase Auth + Neon Setup

This is the exact configuration the code expects. Nothing here is optional for a
live sign-in: the API fails closed until these values are real.

---

## 1. Firebase project

> The console work for the live project (`play-f9fe2`) is a step-by-step runbook
> in **`10_Firebase_Console_Checklist.md`**. This section is the general shape.

1. Create a project at https://console.firebase.google.com.
2. **Add an Android app** with package name `com.zivora.app`.
   - Register the debug SHA-1 (and SHA-256) from `./gradlew signingReport`, plus
     release signing fingerprints before a closed test.
   - Download `google-services.json` and replace
     `apps/android/app/google-services.json` (a placeholder is committed so the
     project still builds).
3. **Authentication → Sign-in method**, enable:
   - **Email link (passwordless)** — required for `emailLink` sign-in.
   - **Google** — set the support email; Firebase creates the web client ID for you.
   - **Phone** — required for payout Minimum KYC. Enable Play Integrity app
     verification (Android) and add test numbers only for local development.
   - Leave **Anonymous** disabled. The API rejects anonymous and custom tokens.
4. **Authentication → Settings → Authorized domains**, add the domain that hosts
   your email sign-in links (the host in `EMAIL_LINK_URL`).
5. Copy these values:
   - `FIREBASE_PROJECT_ID` → Project settings → General → Project ID.
   - `FIREBASE_WEB_API_KEY` → Project settings → General → Web API key. This key
     is public by design, but keep it server-side; the API does not send it to clients.
6. **Do not** download a service-account key for this flow. Server-side ID token
   verification uses Google's public signing certificates. Add a service account
   only if you later need Admin SDK operations (revocation, user deletion).

### Email link deep link

`EMAIL_LINK_URL` must be an HTTPS URL on a domain you control, for example
`https://auth.your-domain.example/verify-email`. It must:

- be listed in Firebase **Authorized domains**,
- match the intent filter generated from the Gradle property (the build injects
  the scheme/host/path into `AndroidManifest.xml`),
- redirect back into the app (`setAndroidPackageName(..., installApp = true)` is
  already configured in `FirebaseAuthClient`).

Build with:

```sh
./gradlew :app:assembleDebug \
  -PAPI_BASE_URL=https://your-api-host \
  -PGOOGLE_WEB_CLIENT_ID=your-web-client-id \
  -PEMAIL_LINK_URL=https://auth.your-domain.example/verify-email
```

For App Links (no disambiguation dialog), host
`/.well-known/assetlinks.json` on that domain and set `android:autoVerify="true"`
in the manifest.

---

## 2. Neon PostgreSQL

1. Create a project at https://console.neon.tech (Free tier is enough to start)
   and pick a region. This project uses **AWS US East 2 (Ohio)** —
   `*.c-7.us-east-2.aws.neon.tech`.
2. Open the project → **Connect** and copy **two** connection strings:
   - **Pooled** (host contains `-pooler.`) → `POSTGRES_URL`
   - **Direct** (host without `-pooler`) → `MIGRATIONS_DATABASE_URL`

   They look like this:

   ```
   postgresql://neondb_owner:<password>@ep-<name>-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   postgresql://neondb_owner:<password>@ep-<name>.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   `channel_binding=require` is a libpq option that `node-postgres` ignores, so
   it is harmless to keep. TLS is what matters, and the API enforces it: `src/db.js`
   requires certificate verification for any `*.neon.tech` host.
3. Write both into `apps/api/.env` (git-ignored):

```sh
cp apps/api/.env.example apps/api/.env
```

URL-encode special characters in the password. Rotate it from the console
(**Roles → neondb_owner → Reset password**) if it was ever shared in chat.

4. Apply the schema:

```sh
npm --workspace @rewards-platform/api run migrate
```

Migrations run in filename order and are recorded in `schema_migrations`, so
re-running is safe. Migration `005_firebase_auth_identity.sql` adds the Firebase
identity columns and drops the retired Supabase columns/tables.

5. Verify connectivity and identity behaviour against the real database:

```sh
npm run db:verify                    # config:check -> migrate -> smoke:identity
npm run dev:api                      # GET /api/health
```

`npm run db:verify` is the whole database bring-up in one command: it validates
the configuration offline, applies migrations `001`–`005` over the **direct**
endpoint, then runs the identity smoke test over the **pooled** endpoint.

The smoke script writes synthetic records, asserts account/wallet/consent
creation, email and phone uniqueness (including the refresh and adoption paths),
Minimum KYC, session revocation, and the auth event trail, then deletes
everything it created.

### Why two connection strings

DDL through Neon's pooler (PgBouncer) can fail on statements that need a
dedicated session. The API uses the pooled endpoint for normal traffic; the
migration runner uses the direct endpoint.

### Branches

Use a Neon branch per environment (console → **Branches**) and run migrations
against each. Branches also give you throwaway copies of production data for
testing, and `main` stays clean.

---

## 3. API environment

| Variable | Purpose | Fail-closed default |
|---|---|---|
| `POSTGRES_URL` | Neon pooled connection string | local Postgres |
| `MIGRATIONS_DATABASE_URL` | Neon direct connection string | falls back to `POSTGRES_URL` |
| `JWT_SECRET` | signs platform API session tokens (HS256) | dev placeholder — must change |
| `AUTH_PROVIDER` | must be `firebase` | `firebase` |
| `FIREBASE_AUTH_ENABLED` | master switch for token verification | `false` |
| `FIREBASE_PROJECT_ID` | audience/issuer check for ID tokens | empty → verification disabled |
| `FIREBASE_WEB_API_KEY` | optional Identity Toolkit lookups | empty → lookups disabled |
| `FIREBASE_ALLOWED_SIGN_IN_PROVIDERS` | providers allowed to hold a wallet | `emailLink,password,google.com,phone.com` |
| `SIGNUP_ENABLED` | allows account creation via Firebase | `false` |
| `TERMS_VERSION` / `PRIVACY_VERSION` | versions the client must echo | empty → sign-in disabled |
| `TERMS_URL` / `PRIVACY_URL` | published, reviewed policy pages | empty → sign-in disabled |
| `MINIMUM_USER_AGE` | self-declaration age gate | `18` |
| `SUPPORT_EMAIL` | shown in profile | empty |
| `ACCOUNT_DELETION_URL` | Play Store deletion requirement | empty |
| `OTP_DELIVERY_ENABLED` / `OTP_PROVIDER_API_KEY` | legacy Fast2SMS fallback | `false` |
| `EMAIL_PROVIDER_API_KEY` / `EMAIL_FROM` | transactional email (Resend) | empty |

Sign-in is enabled only when **all** of these are true:
`AUTH_PROVIDER=firebase`, `FIREBASE_AUTH_ENABLED=true`, `FIREBASE_PROJECT_ID` set,
`SIGNUP_ENABLED=true`, and all four policy values published. Otherwise
`POST /api/v1/auth/firebase/session` returns `503 firebase_sign_in_disabled` and
`GET /api/v1/auth/policies` reports `firebaseSignInEnabled: false`.

---

## 4. Auth endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/auth/policies` | capabilities, policy URLs/versions, minimum age |
| POST | `/api/v1/auth/firebase/session` | exchange a Firebase ID token (plus consent for new accounts) for a 15-minute API session |
| GET | `/api/v1/auth/session` | current Neon-backed profile for the bearer token |
| POST | `/api/v1/auth/session/revoke` | sign out: revokes all API tokens issued so far |
| POST | `/api/v1/auth/withdrawal/phone/verify` | Minimum KYC from a Firebase-verified phone claim |
| POST | `/api/v1/auth/otp/request` | legacy Fast2SMS fallback (disabled by default) |
| POST | `/api/v1/auth/otp/verify` | legacy Fast2SMS fallback |
| GET | `/api/v1/home` | API/Neon-backed balances, featured offers, payout state |
| GET | `/api/v1/profile` | API/Neon-backed profile, referral, consent, support |

Errors carry stable codes the app branches on: `invalid_firebase_token`,
`consent_required`, `stale_policy_version`, `contact_verification_required`,
`unsupported_sign_in_provider`, `account_conflict`, `identity_rate_limited`,
`phone_verification_required`, `account_not_active`, `firebase_unavailable`,
`firebase_sign_in_disabled`.

Two claim details matter when testing against a real Firebase project:

- Firebase ID tokens report phone auth as `firebase.sign_in_provider: "phone"`,
  not `"phone.com"`. The API normalizes both, so the default allowlist works
  either way.
- Minimum KYC requires `phone_number_verified: true` in the token. After a user
  links a phone credential, request a **forced** ID token refresh
  (`getIdToken(true)`) before calling the verify endpoint, otherwise the claim
  may be missing and the request is rejected with `phone_verification_required`.

---

## 5. Configuration doctor

`npm run config:check` validates everything above **without touching the
network** and prints each gate as `ok` / `warn` / `BLOCK` with the exact fix. It
cross-checks `apps/android/app/google-services.json` against the server env
(project id must match, package must be `com.zivora.app`, and it reports
the web OAuth client id you need for `GOOGLE_WEB_CLIENT_ID`), then evaluates
`isFirebaseSignInEnabled` using the same helpers the auth route uses, so it can
never disagree with the API. Exit code 1 means sign-in is still closed.

Run it after every configuration change:

```sh
npm run config:check
```

---

## 6. Pre-launch checks

- [ ] `npm run config:check` reports zero BLOCK items.
- [ ] `google-services.json` is the real file, not the committed placeholder.
- [ ] Debug **and** release SHA fingerprints registered in Firebase.
- [ ] Email link domain authorized and serving the link (test on a real device).
- [ ] Phone auth app verification enabled (Play Integrity), not just test numbers.
- [ ] `JWT_SECRET` and `OTP_HASH_SECRET` are long random values, unique per environment.
- [ ] Neon branch strategy decided (dev branch vs `main`), and migrations applied to each.
- [ ] Policy pages in `site/` have their bracketed placeholders filled in, have had a legal review, and are published (see `site/README.md`).
- [ ] Reviewed `TERMS_URL` / `PRIVACY_URL` published with matching version strings — currently `terms-2026-10-08` and `privacy-2026-10-08`, printed on each page.
- [ ] Each published policy URL actually loads over https (the API rejects `.example` hosts but cannot detect a 404).
- [ ] `ACCOUNT_DELETION_URL` published (Play Store Data Safety requirement).
- [ ] Anonymous and custom sign-in providers remain disabled in Firebase.
- [ ] `npm test` and `npm run build` pass; `smoke:identity` passes against Neon.
- [ ] A real email-link sign-in, a Google sign-in, and a phone Minimum-KYC run have each been completed on a physical device.
