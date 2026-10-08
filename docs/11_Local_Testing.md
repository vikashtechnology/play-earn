# 11 — Testing on Your Local Machine

Everything you need to run this project locally, in order. Two commands do most
of it:

```sh
npm run setup:env -- --postgres-url "…" --migrations-url "…"   # once
npm run verify:local                                           # every time
```

---

## 1. Prerequisites

| Need | Version | Check |
|---|---|---|
| Node.js | **22 LTS** (minimum 20.12 — `process.loadEnvFile`) | `node -v` |
| npm | 10+ (ships with Node 22) | `npm -v` |
| Git | any recent | `git --version` |
| Android Studio + JDK 17 | for the app only | — |
| A Neon project | AWS US East 2 (Ohio), already provisioned | console → Connect |

Get the code:

```sh
git fetch origin
git checkout arena/c9563cf4-play-earn
npm install
```

---

## 2. Create `apps/api/.env` (once per machine)

`.env` is **git-ignored**, so it does not arrive with the repository — every
machine needs its own. `npm run setup:env` builds it:

```sh
npm run setup:env -- \
  --postgres-url "postgresql://USER:PASSWORD@ep-…-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  --migrations-url "postgresql://USER:PASSWORD@ep-….c-7.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  --support-email you@your-domain
```

Both URLs come from the Neon console → **Connect**: the *pooled* one for
`POSTGRES_URL`, the unpooled one for `MIGRATIONS_DATABASE_URL`. Both must keep
`?sslmode=require`.

What the script does, and why it is safe to run:

| Value | Source |
|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `GOOGLE_WEB_CLIENT_ID` | Read from the committed `apps/android/app/google-services.json` — public identifiers by design, they ship inside the APK |
| `JWT_SECRET`, `OTP_HASH_SECRET` | **Generated locally**, 256 bits each, distinct, and never printed |
| `FIREBASE_ALLOWED_SIGN_IN_PROVIDERS` | `emailLink,google.com` — `phone.com` is excluded because phone OTP is withdrawal-only |
| `TERMS_VERSION`, `PRIVACY_VERSION`, the three policy URLs | The drafted pages in `site/`, at their expected GitHub Pages addresses |
| `SIGNUP_ENABLED` | `false`, on purpose — see §5 |

The file is written with mode `600`. It refuses to overwrite an existing `.env`
unless you pass `--force`. Add `--force` if you re-run it after changing your
Neon password.

---

## 3. Run everything

```sh
npm run verify:local              # full gauntlet, including Neon
npm run verify:local -- --skip-db # no database needed (offline, or before Neon is reachable)
```

Stages, in order:

| # | Stage | Command | What it proves |
|---|---|---|---|
| 1 | Node runtime | — | `process.loadEnvFile` exists |
| 2 | Dependencies | — | `npm install` has run |
| 3 | `.env` present | — | Configuration exists on this machine |
| 4 | Configuration doctor | `npm run config:check` | Every gate evaluated by the same helpers the auth route uses |
| 5 | Unit + repository tests | `npm test` | 131 API + 10 validation tests, including pg-mem SQL tests |
| 6 | Build validation | `npm run build` | All 48 source files parse and export correctly |
| 7 | Migrations | `npm run migrate` | Neon reachable, schema applied |
| 8 | Identity smoke test | `smoke:identity` | 27 assertions against the **real** database: account creation, wallet, consent, session revocation, phone conflicts |
| 9 | HTTP smoke test | `npm run smoke:http` | 21 routes through the real request handler; nothing may crash the process |

Every stage is classified:

- **PASS** — succeeded.
- **FAIL** — a real defect. The output above it says where. Exit code 1.
- **ENV** — could not run because of the environment (database unreachable, `.env`
  missing). Not a code fault; the fix is printed. Exit code stays 0.
- **SKIP** — excluded by `--skip-db`.

Reference run from a machine that cannot reach Neon — note that the two database
stages are `ENV`, not `FAIL`, and the run still exits 0:

```
PASS  Node runtime supports process.loadEnvFile          → 22.22.3
PASS  Dependencies installed
PASS  apps/api/.env exists
PASS  Configuration doctor (npm run config:check)        → only expected blocker: SIGNUP_ENABLED
PASS  Unit + pg-mem repository tests (npm test)
PASS  API build validation (npm run build)
ENV   Migrations applied to Neon (npm run migrate)       → Neon did not accept the connection…
ENV   Identity smoke test against Neon (smoke:identity)  → migrations did not apply
PASS  HTTP route smoke test (npm run smoke:http)         → 21/21 routes
```

On your machine, with Neon reachable, those two become `PASS` and the DB-backed
routes in stage 9 (`/home`, `/profile`, payouts, phone verify) return real data
instead of `503 database_unavailable`.

---

## 4. Run the API and the Android app together

The API refuses to boot unless Neon answers — that is deliberate, so a
misconfigured deploy fails loudly instead of serving empty data:

```sh
npm run dev:api          # listens on the PORT in apps/api/.env (4000 by default)
```

Then build the app. The repository has **no Gradle wrapper**, so install Gradle
8.11.1+ and use `gradle` (or run `gradle wrapper --gradle-version 8.11.1` once
and commit it, after which `./gradlew` works). **The phone or emulator cannot use
`localhost`** — that is the device itself, not your machine:

```sh
cd apps/android

# Physical device on the same Wi-Fi — use your machine's LAN IP:
gradle :app:assembleDebug \
  -PAPI_BASE_URL=http://192.168.1.20:4000 \
  -PGOOGLE_WEB_CLIENT_ID=41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com \
  -PEMAIL_LINK_URL=https://auth.your-domain/verify-email

# Android emulator — 10.0.2.2 is the host machine:
gradle :app:assembleDebug \
  -PAPI_BASE_URL=http://10.0.2.2:4000 \
  -PGOOGLE_WEB_CLIENT_ID=41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com \
  -PEMAIL_LINK_URL=https://auth.your-domain/verify-email
```

Install with `gradle :app:installDebug`, or drag the APK from
`app/build/outputs/apk/debug/` onto the device.

Before this works end to end, the Firebase console needs the debug SHA-1 and the
providers enabled — `docs/10_Firebase_Console_Checklist.md` steps 1–3.

---

## 5. Why sign-in is closed, and how to open it

`npm run smoke:http` shows `POST /auth/firebase/session` returning
`503 firebase_sign_in_disabled`. That is the fail-closed gate working, not a bug.
It opens only when **all** of these are true:

```
AUTH_PROVIDER=firebase  +  FIREBASE_AUTH_ENABLED=true  +  real FIREBASE_PROJECT_ID
+  SIGNUP_ENABLED=true   +  non-placeholder TERMS_VERSION and PRIVACY_VERSION
+  TERMS_URL and PRIVACY_URL that pass isPublishedPolicyUrl
```

`isPublishedPolicyUrl` deliberately rejects `localhost`, `127.0.0.1`, and any
`.example` / `.invalid` host — a policy page nobody can open is not a policy
page, and recording consent against it would be meaningless. **So the full
sign-in flow cannot be tested against a local web server.** The fastest path:

1. Fill the bracketed placeholders in `site/` (see `site/README.md`).
2. GitHub → Settings → Pages → Source: **GitHub Actions**.
3. Push `site/` to `main`. The workflow deploys it — and fails while any
   placeholder remains, which is the guard doing its job.
4. Confirm all three URLs load over HTTPS.
5. Set `SIGNUP_ENABLED=true` in `apps/api/.env`, restart, re-run
   `npm run verify:local`.

Minimum KYC (phone verification for a withdrawal) needs only the Firebase
project, **not** the policy pages — so that flow can be tested earlier.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `API startup failed because Neon PostgreSQL could not be reached` | Boot gate; Neon unreachable | Check both URLs, `sslmode=require`, that the project is not suspended, and that your network allows outbound 5432 |
| `migrate` fails with `role … does not exist` | Wrong user in the URL | Use the string from Neon console → Connect, unedited |
| Stage 4 blocks on `google-services.json registers …` | The JSON's `package_name` differs from `applicationId` | Console → Add app → Android → `com.zivora.app`, re-download (docs/10 step 0) |
| `503 firebase_sign_in_disabled` | Gate closed | §5 |
| `503 database_unavailable` from a route | That route needs Neon and cannot reach it | Run `npm run migrate`, then retry |
| `401 invalid_firebase_token` on a real device | Token minted for a different Firebase project, or clock skew | Confirm `FIREBASE_PROJECT_ID=play-f9fe2` matches the app's JSON; check the device clock |
| `403 unsupported_sign_in_provider` | A provider enabled in the app but not in the allowlist | Add it to `FIREBASE_ALLOWED_SIGN_IN_PROVIDERS` — except `phone.com`, which is refused by design |
| `403 phone_sign_in_not_allowed` | Tried to sign in with an SMS OTP | Expected: accounts are created by email link or Google; phone is for withdrawals |
| `stale_policy_version` | The app cached consent for an older policy version | Bump `TERMS_VERSION`/`PRIVACY_VERSION` in both `.env` and the published page, or clear app data |
| Emulator cannot reach the API | Used `localhost` | Use `10.0.2.2` (emulator) or the LAN IP (device) |
| Gradle: `No matching client found for package name` | Package mismatch | Same fix as the stage-4 block above |

---

## 7. What cannot be tested locally

| Not testable | Why | Where it is covered |
|---|---|---|
| Real Firebase ID token verification | Needs outbound HTTPS to `www.googleapis.com` for Google's signing certificates | A device or emulator with internet; `smoke:identity` covers the server logic with locally signed tokens |
| Play Integrity attestation | Needs a real device with Play Services | Physical device, release build |
| AdMob / offerwall / gift-card providers | Not integrated yet | — |
| Razorpay `payment.captured` webhooks | Needs a live merchant account and a public HTTPS endpoint | Staging with a tunnel, once products are wired to Neon |
| The admin console | `apps/admin` is still a stub `package.json` | — |

---

## 8. Before you ship

```sh
npm run config:check     # zero blocking items
npm run verify:local     # all stages PASS, none ENV
npm run db:verify        # the same, database-only
```

Then work through `docs/05_Quick_Reference.md` (pre-launch checklist) and
`docs/10_Firebase_Console_Checklist.md` (console tick list).
