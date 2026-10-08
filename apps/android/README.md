# Android app

Kotlin + Jetpack Compose Android application for **Play & Earn Real Cash**, an India-first rewards marketplace.

## Stack

- Jetpack Compose (Material 3), Coroutines, `kotlinx-coroutines-play-services`
- **Firebase Auth**: email link (passwordless), Google via Credential Manager, phone OTP for payout Minimum KYC
- **Neon PostgreSQL** behind the API — the app never talks to the database directly
- API sessions: the app exchanges its Firebase ID token for a short-lived platform token stored with AES/GCM in the Android Keystore

## Open and build

- Open this directory in Android Studio.
- Use JDK 17, Android SDK 36, and Gradle 8.11.1+ (Android Gradle Plugin 8.9.1).
- Drop the real `google-services.json` from the Firebase console into `app/`, replacing the committed placeholder. The build compiles with the placeholder, but Firebase calls will fail until it is replaced.
- Build with the environment properties you need:

```sh
./gradlew :app:assembleDebug \
  -PAPI_BASE_URL=http://10.0.2.2:4000 \
  -PGOOGLE_WEB_CLIENT_ID=your-web-client-id \
  -PEMAIL_LINK_URL=https://auth.your-domain.example/verify-email
```

  - `API_BASE_URL` defaults to `http://10.0.2.2:4000` (the emulator's host loopback). Use an HTTPS host for any real device or deployed environment.
  - `GOOGLE_WEB_CLIENT_ID` is the OAuth web client registered for the Firebase project's audience.
  - `EMAIL_LINK_URL` must be an HTTPS page on a domain authorized in Firebase. The build injects its scheme/host/path into the manifest intent filter.

## Auth flows in the app

| Flow | Where | What happens |
|---|---|---|
| Email link sign-up | `auth/SignupScreen.kt` | consent + name/email → Firebase emails a sign-in link → link returns to the app → Firebase ID token → `POST /api/v1/auth/firebase/session` with consent |
| Google sign-in | `auth/SignupScreen.kt` | Credential Manager → Firebase `signInWithCredential` → ID token → session exchange with consent |
| Silent re-auth | `MainActivity.ensureSession` | Firebase persists sign-in; a missing/expired API token is re-exchanged on launch |
| Minimum KYC (phone) | `auth/PhoneVerificationScreen.kt` | Firebase phone OTP → link to the signed-in account → refreshed ID token → `POST /api/v1/auth/withdrawal/phone/verify` |
| Cash withdrawal | `auth/CashWithdrawalScreen.kt` | `POST /api/v1/payouts/{userId}` with the API session token; blocked until Minimum KYC |
| Sign out | `MainActivity.signOut` | `POST /api/v1/auth/session/revoke` → Firebase sign-out → encrypted local session cleared |

Consent (18+ self-declaration, Terms, Privacy Notice, and the two optional
preferences) is captured before Firebase creates the account and is sent with the
policy versions the user actually saw. The API rejects stale versions, so an old
consent screen cannot be replayed. For email links, consent is kept encrypted on
the device until the link arrives.

## Home, wallet, and profile

`MarketplaceApi` reads `/api/v1/home` and `/api/v1/profile`, which are backed by
Neon: coin buckets (available/pending/reserved/reversed plus separate in-app
AdMob coins), featured offers, referral code, consent versions, and payout state.
Guests see the marketplace with zero balances and no personal data.

## Secrets and safety rules

- No provider credentials belong in the APK. `google-services.json` contains only public Firebase identifiers.
- Firebase ID tokens are sent to the API over HTTPS only and are never logged or persisted.
- Only the short-lived platform session token is stored, sealed with an Android Keystore key.
- AdMob rewarded ads grant in-app-only coins that can never be redeemed for cash or gift cards.
- Install offers open only through a Google Play Store listing.
- The UI never promises guaranteed income.

## Not yet available

- Gradle compilation has not been verified in the repository's sandbox environment (no JDK/Gradle). Build in Android Studio and treat the first successful compile as the checkpoint.
- Account deletion in-app, ledger history, notifications, and referral rewards remain release gates.
