# Local Infrastructure

Full provider setup lives in [docs/09_Firebase_Neon_Setup.md](../docs/09_Firebase_Neon_Setup.md).

## Prerequisites

- Node.js 22+ and npm (the API uses `process.loadEnvFile`, so 20.12+ is the floor and 22 is recommended)
- Docker Desktop with Docker Compose v2 (optional: only for the local Postgres/Redis stack)
- Android Studio with JDK 17 and Android SDK 36 for the app
- A Neon project and a Firebase project

## Connect the API to Neon

Edit `apps/api/.env` (create it from `apps/api/.env.example`) and set:

- `POSTGRES_URL` — the Neon **pooled** connection string (`-pooler` host), with `sslmode=require`
- `MIGRATIONS_DATABASE_URL` — the Neon **direct** connection string, with `sslmode=require`

URL-encode special characters in the password and keep `.env` out of source control (it is git-ignored).

Then apply the schema and start the API from the repository root:

```sh
npm --workspace @rewards-platform/api run migrate
npm run dev:api
```

The API verifies PostgreSQL connectivity before it listens, and enforces TLS for
Neon hosts. Redis stays optional for the current routes and can be configured
with `REDIS_URL`.

## Configure Firebase Auth

Sign-in is fail-closed. To enable it locally, set in `apps/api/.env`:

```sh
AUTH_PROVIDER=firebase
FIREBASE_AUTH_ENABLED=true
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_WEB_API_KEY=your-public-web-api-key
SIGNUP_ENABLED=true
TERMS_VERSION=terms-2026-10-01
PRIVACY_VERSION=privacy-2026-10-01
TERMS_URL=https://your-domain.example/terms
PRIVACY_URL=https://your-domain.example/privacy
```

All of the above must be present: `GET /api/v1/auth/policies` reports
`firebaseSignInEnabled: false` and the session endpoint returns `503` until the
Firebase project **and** reviewed policy URLs/versions are configured. Never
enable sign-in against placeholder policy URLs.

No Firebase service-account key is required. The API verifies ID tokens against
Google's published signing certificates and stores only the Firebase UID.

Transactional email (Resend) is separate from authentication: Firebase sends its
own verification mail. Configure `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM` only
for receipts and support replies. The legacy Fast2SMS OTP path stays disabled
(`OTP_DELIVERY_ENABLED=false`) unless DLT templates are approved; Firebase phone
auth is the primary Minimum-KYC path.

## Verify against Neon

```sh
npm test                                                 # unit + route tests (no database needed)
npm run build                                            # syntax + migration checks
npm --workspace @rewards-platform/api run smoke:identity  # writes and deletes synthetic records in Neon
```

The identity smoke run checks Firebase account/wallet/consent creation, email and
phone uniqueness, Minimum-KYC persistence, session revocation, and the auth event
trail, then removes its temporary records.

## Start the local Docker stack

The repository root `.env` (copy from `.env.example`) holds local placeholders.
Change the local passwords/secrets first, then:

```sh
npm run infra:up
```

Compose starts PostgreSQL and Redis, waits for their health checks, applies SQL
migrations, and starts the API at `http://localhost:4000/api/health`.

To develop against Neon instead of the compose Postgres, set `API_POSTGRES_URL`
(pooled) and `MIGRATIONS_DATABASE_URL` (direct) in the root `.env`; both the
`migrate` and `api` services pick them up. Firebase variables are passed through
from the same file.

Useful commands:

```sh
npm run infra:logs
npm run infra:down
```

The compose stack is for local development only. Never deploy its default
credentials or the development `JWT_SECRET`.

## Current persistence status

Neon is the source of truth for identity, wallets, consents, Minimum KYC, auth
audit events, home balances, and featured offers. The offers, rewards, products,
orders, and payout **write** routes still keep working state in process memory
and are tracked by task 9 in [docs/tasks.md](../docs/tasks.md); a running
database does not yet make those routes persistent.
