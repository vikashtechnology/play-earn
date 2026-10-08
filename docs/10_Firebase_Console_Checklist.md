# 10 — Firebase Console Checklist (`play-f9fe2`)

**Project:** `play-f9fe2` · **Project number:** `41843791180` · **Console:** https://console.firebase.google.com/project/play-f9fe2
**Decision recorded:** the app's `applicationId` stays **`com.zivora.app`**, so that package must be registered in Firebase.

Work top to bottom. Steps 0–3 are required before any auth flow works on a device;
steps 4–8 are hardening and cleanup.

---

## Step 0 — Package registration ✅ done

The app's `applicationId` and `namespace` are **`com.zivora.app`**, and
`apps/android/app/google-services.json` registers that exact package
(`mobilesdk_app_id: 1:41843791180:android:d834f87a38947c189eabe9`). The doctor
confirms it:

```sh
npm run config:check     # → ok  Android package matches com.zivora.app
```

This matters because the google-services Gradle plugin matches the JSON's
`package_name` against `applicationId`; a mismatch fails the build with
`No matching client found for package name 'com.zivora.app'`. The applicationId
is permanent once you publish on Play, so treat `com.zivora.app` as final.

**Console cleanup still owed:** the project also holds two earlier, now-unused
Android app registrations — `com.playgames.app` and `com.rewardsplatform.app`.
Delete both (**Project settings → Your apps → ⋮ → Remove app**) so nobody
downloads the wrong `google-services.json` later.

The web OAuth client is shared across registrations and stays as-is. Credential
Manager needs it for Google sign-in, and the server reads `GOOGLE_WEB_CLIENT_ID`
from the same value:

```
41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com
```

> ⚠️ **Branding:** `app_name` in `app/src/main/res/values/strings.xml` is still
> "Zivora", as are the legal pages in `site/` and the docs, while
> the package is now `com.zivora.app`. If Zivora is the public brand, decide
> before launch — changing the name inside the published policy pages requires
> bumping `TERMS_VERSION` and `PRIVACY_VERSION` so the app re-collects consent.
---

## Step 1 — SHA-1 and SHA-256 fingerprints (debug **and** release)

Phone auth, Google sign-in, and App Check all depend on these. Missing release
fingerprints is the most common cause of "works in debug, fails in release".

Get the debug fingerprints:

```sh
cd apps/android
./gradlew signingReport
```

Copy **SHA-1** and **SHA-256** for the `debug` variant into
**Project settings → Your apps → `com.zivora.app` → Add fingerprint**.

For release, create a keystore first (**never commit it** — it is already
git-ignored via `*.jks`/`local.properties`; keep an offline backup, because
losing it means losing the ability to update the app):

```sh
keytool -genkeypair -v -keystore zivora-release.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias zivora
```

Then get its fingerprints:

```sh
keytool -list -v -keystore zivora-release.jks -alias zivora
```

Add both to Firebase, and keep the keystore credentials outside the repository
(environment variables or a secrets manager referenced from
`signingConfigs` in `app/build.gradle.kts`).

> Play App Signing: if you enrol, Play re-signs your builds, so also add the
> **App signing key** SHA-1/SHA-256 from **Play Console → Setup → App integrity**.

---

## Step 2 — Sign-in providers

**Authentication → Sign-in method:**

| Provider | Set to | Why |
|---|---|---|
| **Email link (passwordless)** | **Enable** | Primary sign-up path. Requires the authorized domain in Step 3. |
| **Google** | **Enable** | Second sign-up path. Set the project support email; Firebase creates the web client automatically. |
| **Phone** | **Enable** | Grants Minimum KYC for cash payouts. Turn on **Play Integrity** app verification for Android. |
| Email/Password | Leave **disabled** | Not used by the app. The server allowlist tolerates `password`, and unverified emails are rejected anyway, so enabling it adds no value. |
| **Anonymous** | **Disabled** | The API refuses anonymous and custom tokens: every wallet must belong to a verifiable identity. |

**Phone test numbers (development only):** Authentication → Sign-in method →
Phone → **Phone numbers for testing**. Add your own number with a fixed code so
you can iterate without burning SMS quota. Remove them before release.

**SMS quota:** the Spark (free) plan has a small daily phone-verification quota.
Check **Authentication → Settings → Usage** before a closed test; real traffic
needs the Blaze plan. See `docs/03_Free_Providers.md`.

---

## Step 3 — Authorized domain for email links (decision required)

Email-link sign-in needs a real HTTPS page that receives the link and hands it
back to the app. The current Gradle default is a placeholder:

```
EMAIL_LINK_URL default = https://auth.zivora.example/verify-email   ← not a real host
```

So before email sign-in can work you must:

1. **Choose a domain you control** and host a page that completes the link, for
   example `https://auth.<your-domain>/verify-email`.
2. **Authentication → Settings → Authorized domains → Add domain.**
3. Build the app with that URL — the build injects its scheme/host/path into the
   manifest intent filter:

   ```sh
   ./gradlew :app:assembleDebug \
     -PAPI_BASE_URL=https://<your-api-host> \
     -PGOOGLE_WEB_CLIENT_ID=41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com \
     -PEMAIL_LINK_URL=https://auth.<your-domain>/verify-email
   ```

4. For App Links without the disambiguation dialog, host
   `https://auth.<your-domain>/.well-known/assetlinks.json` containing the
   release signing certificate SHA-256 and `com.zivora.app`, and set
   `android:autoVerify="true"` on the intent filter.

A cheap path: host the page on the same GitHub Pages site as the legal pages in
`site/`, then its domain is `vikashtechnology.github.io` — authorized, HTTPS,
and already deployable. Note that `github.io` cannot serve App Links
verification for a custom package, so the link will open via the disambiguation
dialog; that is acceptable for testing, not ideal for launch.

---

## Step 4 — App Check (Play Integrity)

Recommended before any public release: it stops non-app clients from calling
Firebase Auth with your project credentials.

1. **App Check → Apps → `com.zivora.app` → Register** with the SHA-256
   from Step 1.
2. **Providers → Play Integrity → Enable.**
3. Test the flows still work, then consider **enforcing** per API
   (App Check → APIs). Enforce last — enforcing before the app is correctly
   attested locks out real users.

The API does not depend on App Check: it verifies ID token signatures against
Google's published certificates independently. App Check reduces junk traffic
and credential abuse.

---

## Step 5 — Delete unused Firebase services

The project currently has services this app never uses (Neon Postgres is the
only datastore):

| Service | Evidence | Action |
|---|---|---|
| **Realtime Database** | `firebase_url: https://play-f9fe2-default-rtdb.asia-southeast1.firebasedatabase.app` | **Delete it**, or set rules to `{".read": false, ".write": false}` |
| **Storage** | `storage_bucket: play-f9fe2.firebasestorage.app` | Delete, or lock the rules |
| **Firestore** | if enabled | Delete, or lock the rules |

A Realtime Database left in **test mode** is publicly readable and writable by
anyone who finds the URL — that is an open data leak even while the database is
empty, because it invites abuse and shows up in security scans. If you keep any
of them, publish deny-by-default rules and add them to the pre-launch checklist.

---

## Step 6 — Restrict the API key

The Android API key in `google-services.json` is public by design, but it should
still be scoped:

1. **Project settings → API keys → the Android key → Edit.**
2. **Application restrictions → Android apps** → add `com.zivora.app`
   with the SHA-1 fingerprints from Step 1.
3. **API restrictions → Restrict key** → allow only **Identity Toolkit API** and
   **Token Service API** (add **Cloud Messaging** later if you add push).

> ⚠️ Server-side nuance: `FIREBASE_WEB_API_KEY` in `apps/api/.env` is used from
> the API server for optional read-only Identity Toolkit lookups. A key
> restricted to Android apps **will not work from a server**. Either leave
> `FIREBASE_WEB_API_KEY` unset (lookups stay disabled — the primary flow does not
> need them, because ID token verification uses Google's public certificates, not
> this key), or create a **second** key restricted to the Identity Toolkit API and
> optionally to your server's egress IPs. Never reuse the restricted Android key
> server-side and never ship a server key in the APK.

---

## Step 7 — Service accounts

**Not required.** Server-side ID token verification fetches Google's public
signing certificates, so there is no service-account key to manage or leak.

Create one only if you later need Admin SDK operations — provider-side token
revocation, deleting a Firebase user when an account is deleted, or reading
account metadata in bulk. Store it **server-side only** (secret manager), never
in the repository and never in the APK.

---

## Step 8 — Verify on a real device

The sandbox cannot run any of this, so these are your acceptance tests:

| Flow | Expected |
|---|---|
| Email link sign-up | Consent screen → Firebase emails the link → tapping it returns to the app → `POST /api/v1/auth/firebase/session` returns a 15-minute token → Home shows balances |
| Google sign-in | Credential Manager account picker → Firebase sign-in → same session exchange |
| Phone Minimum KYC | Phone OTP → link to the signed-in account → forced ID token refresh → `POST /api/v1/auth/withdrawal/phone/verify` returns `minimumKycVerified: true` |
| Sign out | `POST /api/v1/auth/session/revoke` → Firebase sign-out → local encrypted session cleared → next launch requires sign-in |
| Wrong package | Build must fail loudly rather than silently signing in as another app |

Watch for `unsupported_sign_in_provider` (a provider enabled in the app but not
in `FIREBASE_ALLOWED_SIGN_IN_PROVIDERS`), `invalid_audience` (the token was
minted for a different Firebase project), and `phone_verification_required`
(the app did not force-refresh the ID token after linking the phone credential).

---

## Tick list

- [x] `com.zivora.app` registered; matching `google-services.json` in `apps/android/app/`
- [x] `npm run config:check` shows no package-name BLOCK
- [ ] Stale `com.playgames.app` / `com.rewardsplatform.app` registrations deleted
- [ ] Public brand name decided (app label + policy pages vs `com.zivora.app`)
- [ ] Debug SHA-1 **and** SHA-256 added
- [ ] Release keystore created, backed up offline, fingerprints added
- [ ] Play App Signing key fingerprints added (if enrolled)
- [ ] Email link enabled
- [ ] Google enabled with support email
- [ ] Phone enabled with Play Integrity; test numbers added for dev
- [ ] Email/Password and Anonymous left disabled
- [ ] Authorized domain added for `EMAIL_LINK_URL`, and the page live over HTTPS
- [ ] App Check registered with Play Integrity
- [ ] Realtime Database / Storage / Firestore deleted or locked
- [ ] Android API key restricted by app + SHA, and to Identity Toolkit / Token Service
- [ ] Server key decision made (unset, or a separate restricted key)
- [ ] No service-account key in the repository
- [ ] Phone test numbers removed before release
- [ ] Blaze plan decision made for phone-auth volume
- [ ] All four flows in Step 8 pass on a physical device
