# 12 — Linux Setup, Run, and Build

Complete instructions for a Linux machine (written on Ubuntu 24.04 / Debian 12;
other distros need only the package-manager commands swapped).

## Do it in one command

After cloning (§2), `scripts/linux-setup.sh` runs every stage below for you —
system packages, Node 22, JDK 17, the headless Android SDK, Gradle, the wrapper
this repository is missing, `npm install`, `apps/api/.env`, verification, and
optionally the debug APK. It is idempotent: each stage checks whether the work
is already done and skips it, so re-running after a failure is safe.

```sh
bash scripts/linux-setup.sh --dry-run   # see exactly what it would do
bash scripts/linux-setup.sh             # then run it for real
bash scripts/linux-setup.sh --skip-apk  # everything but the APK build
bash scripts/linux-setup.sh --only=android,gradle
```

It asks before anything that needs `sudo`, never prints a secret, and appends to
`~/.bashrc` only when a line is not already there. The rest of this document
explains what each stage does, so you can run any of them by hand.

**Heads-up:** the repository has **no Gradle wrapper** — no `gradlew`, no
`gradle/wrapper/`. The script generates one in stage 4; until then use `gradle …`
rather than `./gradlew`.

---

## 1. Required tools

| Tool | Version | Why |
|---|---|---|
| Git | any recent | clone the repository |
| **Node.js** | **22 LTS** (min 20.12) | the API; `process.loadEnvFile` needs 20.12+ |
| npm | 10+ | ships with Node 22 |
| **JDK** | **17** (exactly — not 21+) | Android Gradle Plugin 8.9 requires JDK 17 |
| **Gradle** | **8.11.1+** | AGP 8.9.1 minimum; the repo has no wrapper |
| Android SDK cmdline-tools | latest | headless SDK management |
| Android platform | **36** | `compileSdk = 36`, `targetSdk = 36` |
| Android build-tools | 36.0.0 | matching the platform |
| platform-tools (`adb`) | latest | install onto a device, read logs |
| KVM + emulator images | — | only if you use an emulator instead of a phone |

Declared versions in the build, for reference: AGP `8.9.1`, Kotlin `2.0.21`,
Compose compiler plugin `2.0.21`, google-services `4.4.2`, `minSdk 26`,
applicationId `com.zivora.app`.

### Install the base toolchain

```sh
sudo apt update
sudo apt install -y git curl unzip zip openjdk-17-jdk
```

Node 22 — pick one:

```sh
# (a) nvm — recommended, keeps Node versions per project
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL -l
nvm install 22 && nvm use 22 && nvm alias default 22

# (b) NodeSource system package
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Point `JAVA_HOME` at JDK 17 (AGP fails confusingly on other versions):

```sh
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >> ~/.bashrc
exec $SHELL -l

java -version    # must print 17.x
node -v          # must print v22.x
```

---

## 2. Clone and run the API

```sh
git clone https://github.com/vikashtechnology/play-earn.git
cd play-earn
git checkout arena/c9563cf4-play-earn     # the working branch
npm install
```

Create `apps/api/.env` — it is git-ignored, so it does not come with the clone.
Both Neon URLs are in the console under **Connect** (pooled and unpooled), and
both must keep `?sslmode=require`:

```sh
npm run setup:env -- \
  --postgres-url "postgresql://USER:PASS@ep-…-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  --migrations-url "postgresql://USER:PASS@ep-….c-7.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  --support-email you@your-domain
```

Then run the whole verification gauntlet:

```sh
npm run verify:local              # 9 stages, including migrations on Neon
npm run verify:local -- --skip-db # if Neon is not reachable yet
```

Start the API:

```sh
npm run dev:api                   # http://localhost:4000/api/health
```

It refuses to boot unless Neon answers — deliberate, so a misconfigured deploy
fails loudly instead of serving empty data.

Full detail on every stage, plus troubleshooting: **`docs/11_Local_Testing.md`**.

---

## 3. Android SDK, headless (no Android Studio needed)

Android Studio is the easy path (`sudo snap install android-studio` or the
`.tar.gz` from developer.android.com) and includes the SDK manager. To build
from the terminal only:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"
cd /tmp

# Check the current filename at https://developer.android.com/studio
# (scroll to "Command line tools only") — the build number changes over time.
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q commandlinetools-linux-*_latest.zip -d "$ANDROID_HOME/cmdline-tools"
mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
```

Put it on your PATH permanently:

```sh
cat >> ~/.bashrc <<'EOF'
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
EOF
exec $SHELL -l
```

Accept the licences (Gradle fails without this) and install the packages:

```sh
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --list_installed
```

Tell Gradle where the SDK is — either of these works:

```sh
# (a) environment variable, already exported above
export ANDROID_HOME="$HOME/Android/Sdk"

# (b) or a git-ignored file per machine
echo "sdk.dir=$HOME/Android/Sdk" > apps/android/local.properties
```

> If AGP asks for a different `build-tools` version, install exactly what it
> names: `sdkmanager "build-tools;<version>"`. With licences accepted it can also
> fetch missing packages itself.

---

## 4. Gradle (and generating the missing wrapper)

```sh
# SDKMAN is the cleanest way to manage Gradle versions
curl -s "https://get.sdkman.io" | bash
exec $SHELL -l
sdk install gradle 8.11.1
gradle --version        # must be 8.11.1 or newer
```

**Then generate the wrapper once and commit it** — after this, `./gradlew` works
for everyone and the version is pinned:

```sh
cd apps/android
gradle wrapper --gradle-version 8.11.1
git add gradlew gradlew.bat gradle/wrapper/
git commit -m "Add the Gradle wrapper"
```

Until you do, use `gradle` wherever the docs say `./gradlew`.

---

## 5. Build the app

The build takes three properties. **A phone or emulator cannot use `localhost`**
— that address is the device itself, not your machine.

```sh
cd apps/android

# Find your machine's LAN address (for a physical phone on the same Wi-Fi):
hostname -I
```

```sh
# Physical device — replace 192.168.1.20 with your LAN IP
gradle :app:assembleDebug \
  -PAPI_BASE_URL=http://192.168.1.20:4000 \
  -PGOOGLE_WEB_CLIENT_ID=41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com \
  -PEMAIL_LINK_URL=https://auth.your-domain/verify-email

# Emulator — 10.0.2.2 is the host machine from inside the emulator
gradle :app:assembleDebug \
  -PAPI_BASE_URL=http://10.0.2.2:4000 \
  -PGOOGLE_WEB_CLIENT_ID=41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com \
  -PEMAIL_LINK_URL=https://auth.your-domain/verify-email
```

Output: `apps/android/app/build/outputs/apk/debug/app-debug.apk`

Install and watch it:

```sh
adb devices                                  # your device must be listed
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat -s Zivora:V AndroidRuntime:E      # or: gradle :app:installDebug
```

If the phone cannot reach the API, check the Linux firewall:

```sh
sudo ufw status
sudo ufw allow 4000/tcp        # only if ufw is active
```

The API binds all interfaces, so no extra `--host` flag is needed.

**Before auth works on a device**, Firebase needs the debug SHA-1 and the
providers enabled — `docs/10_Firebase_Console_Checklist.md` steps 1–3:

```sh
gradle signingReport           # copy SHA-1 and SHA-256 for the debug variant
```

---

## 6. Emulator on Linux (optional)

An emulator needs KVM; without it, it is unusably slow.

```sh
sudo apt install -y qemu-kvm libvirt-daemon-system cpu-checker
sudo usermod -aG kvm $USER
sudo usermod -aG libvirt $USER
newgrp kvm                     # or log out and back in
kvm-ok                         # must say "KVM acceleration can be used"

sdkmanager "system-images;android-36;google_apis;x86_64"
avdmanager create avd -n zivora -k "system-images;android-36;google_apis;x86_64" -d pixel_6
emulator -avd zivora
```

If that exact system image is unavailable, list what exists:

```sh
sdkmanager --list | grep system-images | grep android-36
```

Phone auth with Play Integrity needs a **real device** — emulators cannot pass
hardware attestation.

---

## 7. Release build

A release APK needs a signing keystore. Create it once and keep it safe: losing
it means losing the ability to ever update the app.

```sh
keytool -genkeypair -v -keystore ~/keys/zivora-release.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias zivora
```

`*.jks`, `*.keystore`, and `keystore.properties` are already git-ignored. Wire
the keystore into `signingConfigs` in `app/build.gradle.kts` with credentials
read from environment variables — never hard-coded — then:

```sh
gradle :app:assembleRelease
```

Add the release SHA-1 **and** SHA-256 to Firebase, plus the Play App Signing key
from Play Console → Setup → App integrity if you enrol. Details in
`docs/10_Firebase_Console_Checklist.md` step 1.

---

## 8. Quick reference

```sh
# --- first time only -------------------------------------------------------
sudo apt install -y git curl unzip zip openjdk-17-jdk qemu-kvm cpu-checker
nvm install 22                       # or the NodeSource route
sdk install gradle 8.11.1            # via SDKMAN
# Android SDK: §3

# --- clone -----------------------------------------------------------------
git clone https://github.com/vikashtechnology/play-earn.git && cd play-earn
git checkout arena/c9563cf4-play-earn
npm install
npm run setup:env -- --postgres-url "…" --migrations-url "…"

# --- verify ----------------------------------------------------------------
npm run verify:local

# --- run -------------------------------------------------------------------
npm run dev:api                      # terminal 1
cd apps/android && gradle :app:assembleDebug -PAPI_BASE_URL=http://10.0.2.2:4000 \
  -PGOOGLE_WEB_CLIENT_ID=41843791180-aenmlq2okckiee7ounn3t1bulbh6pacv.apps.googleusercontent.com \
  -PEMAIL_LINK_URL=https://auth.your-domain/verify-email   # terminal 2
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 9. Linux troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `gradlew: No such file or directory` | No wrapper in the repo | §4 — use `gradle`, or generate the wrapper |
| `Unsupported class file major version 65` | JDK 21 instead of 17 | `sudo apt install openjdk-17-jdk`, set `JAVA_HOME` (§1) |
| `SDK location not found` | `ANDROID_HOME` unset and no `local.properties` | §3 |
| `Failed to install the following SDK components` | Licences not accepted | `yes \| sdkmanager --licenses` |
| `sdkmanager: command not found` | cmdline-tools not on PATH | re-run the `~/.bashrc` block in §3, then `exec $SHELL -l` |
| `emulator: KVM acceleration not available` | No KVM, or user not in `kvm` group | §6, then log out and back in |
| `adb: no devices/emulators found` | USB debugging off, or no udev rule | Enable Developer options → USB debugging; for a physical phone add an udev rule for the vendor id, then `adb kill-server && adb devices` |
| App cannot reach the API | Used `localhost`, or firewall | `10.0.2.2` (emulator) or LAN IP (device); `sudo ufw allow 4000/tcp` |
| `npm run dev:api` exits immediately | Neon unreachable — boot gate | `docs/11` §6 |
| `verify:local` reports `ENV` on migrations | Network cannot reach `*.neon.tech:5432` | Check VPN/proxy/firewall; Neon must be reachable on port 5432 |
| Gradle download stalls | Corporate proxy | `export GRADLE_OPTS=-Dhttps.proxyHost=… -Dhttps.proxyPort=…` |
