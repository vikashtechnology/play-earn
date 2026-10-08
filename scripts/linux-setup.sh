#!/usr/bin/env bash
# One-command Linux setup for Zivora: system packages, Node 22, JDK 17, the
# headless Android SDK, Gradle (and the wrapper this repository is missing),
# npm dependencies, apps/api/.env, verification, and optionally the debug APK.
#
#   bash scripts/linux-setup.sh                  # interactive, every stage
#   bash scripts/linux-setup.sh --dry-run        # print what would happen
#   bash scripts/linux-setup.sh --skip-apk       # everything but the APK build
#   bash scripts/linux-setup.sh --only=android,gradle
#
# Every stage is idempotent: it checks whether the work is already done and
# skips if so, so re-running after a failure is safe. Nothing here is
# destructive, and no secret is ever printed.
#
# Docs: docs/12_Linux_Setup.md (what each stage does and why)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[zivora-setup]"

# --- tunables ---------------------------------------------------------------
NODE_MAJOR="${NODE_MAJOR:-22}"
JDK_PACKAGE="${JDK_PACKAGE:-openjdk-17-jdk}"
GRADLE_VERSION="${GRADLE_VERSION:-8.11.1}"
ANDROID_PLATFORM="${ANDROID_PLATFORM:-36}"
BUILD_TOOLS="${BUILD_TOOLS:-36.0.0}"
# The command-line tools build number changes over time. Override with
# CMDLINE_TOOLS_URL if Google has published a newer one; check
# https://developer.android.com/studio -> "Command line tools only".
CMDLINE_TOOLS_URL="${CMDLINE_TOOLS_URL:-https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip}"
GRADLE_URL="https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
API_PORT="${API_PORT:-4000}"

# --- flags ------------------------------------------------------------------
DRY_RUN=0
ASSUME_YES=0
SKIP_APK=0
ONLY=""
POSTGRES_URL="${POSTGRES_URL:-}"
MIGRATIONS_URL="${MIGRATIONS_URL:-}"
SUPPORT_EMAIL="${SUPPORT_EMAIL:-}"
API_BASE_URL="${API_BASE_URL:-}"
EMAIL_LINK_URL="${EMAIL_LINK_URL:-https://auth.your-domain/verify-email}"
GOOGLE_WEB_CLIENT_ID="${GOOGLE_WEB_CLIENT_ID:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)        DRY_RUN=1 ;;
    --yes|-y)         ASSUME_YES=1 ;;
    --skip-apk)       SKIP_APK=1 ;;
    --only=*)         ONLY="${1#*=}" ;;
    --postgres-url)   POSTGRES_URL="${2:-}"; shift ;;
    --migrations-url) MIGRATIONS_URL="${2:-}"; shift ;;
    --support-email)  SUPPORT_EMAIL="${2:-}"; shift ;;
    --api-base-url)   API_BASE_URL="${2:-}"; shift ;;
    --email-link-url) EMAIL_LINK_URL="${2:-}"; shift ;;
    --help|-h)
      # Print the leading comment block only: skip the shebang, stop at the
      # first line of real code.
      awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) echo "$LOG_PREFIX unknown argument: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

STAGES=(system node android gradle deps env verify apk)

stage_selected() {
  [[ -z "$ONLY" ]] && return 0
  [[ ",$ONLY," == *",$1,"* ]]
}

say()  { printf '\n\033[1m%s %s\033[0m\n' "$LOG_PREFIX" "$1"; }
note() { printf '  %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
skip() { printf '  \033[33m·\033[0m skipped: %s\n' "$1"; }
die()  { printf '\n\033[31m%s %s\033[0m\n' "$LOG_PREFIX" "$1" >&2; exit 1; }

FAILED_STAGES=()

# run <description> <command...> — honours --dry-run and never aborts the script,
# so one failing stage still reports at the end.
run() {
  local description="$1"; shift
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  \033[36mdry-run\033[0m %s\n        $ %s\n' "$description" "$*"
    return 0
  fi
  note "\$ $*"
  if "$@"; then
    ok "$description"
    return 0
  fi
  printf '  \033[31m✗\033[0m %s (exit %s)\n' "$description" "$?" >&2
  return 1
}

confirm() {
  [[ $ASSUME_YES -eq 1 ]] && return 0
  [[ $DRY_RUN -eq 1 ]] && return 0
  read -r -p "  $1 [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

need_sudo() {
  if [[ $EUID -eq 0 ]]; then SUDO=""; else SUDO="sudo"; fi
}

# --- environment ------------------------------------------------------------
say "Stage 0 · environment"
note "repository   $REPO_ROOT"
note "kernel       $(uname -sr)"
note "user         $(id -un)"

if [[ "$(uname -s)" != "Linux" ]]; then
  die "this script is for Linux; see docs/12_Linux_Setup.md for the manual steps"
fi

PKG_MANAGER=""
if command -v apt-get >/dev/null 2>&1; then PKG_MANAGER="apt"
elif command -v dnf >/dev/null 2>&1; then PKG_MANAGER="dnf"
elif command -v pacman >/dev/null 2>&1; then PKG_MANAGER="pacman"
fi
note "packages     ${PKG_MANAGER:-none detected}"
[[ -z "$PKG_MANAGER" ]] && note "no supported package manager — the system stage will be skipped"

SHELL_RC="${SHELL_RC:-$HOME/.bashrc}"
[[ -f "$SHELL_RC" ]] || SHELL_RC="$HOME/.profile"
note "shell rc     $SHELL_RC"
[[ $DRY_RUN -eq 1 ]] && note "mode         DRY RUN — nothing will be changed"

# Persist an export line exactly once.
persist_export() {
  local line="$1"
  if grep -qsF -- "$line" "$SHELL_RC"; then
    return 0
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  \033[36mdry-run\033[0m append to %s: %s\n' "$SHELL_RC" "$line"
    return 0
  fi
  printf '%s\n' "$line" >> "$SHELL_RC"
  ok "added to $SHELL_RC: $line"
}

# ===========================================================================
# Stage 1 · system packages
# ===========================================================================
if stage_selected system; then
  say "Stage 1 · system packages (JDK 17, git, curl, unzip, KVM)"
  need_sudo

  case "$PKG_MANAGER" in
    apt)
      if confirm "Install git curl unzip zip wget $JDK_PACKAGE qemu-kvm cpu-checker with $SUDO apt?"; then
        run "update the package index" $SUDO apt-get update -y || true
        run "install system packages" $SUDO apt-get install -y \
          git curl unzip zip wget ca-certificates "$JDK_PACKAGE" qemu-kvm cpu-checker \
          || FAILED_STAGES+=("system")
      else
        skip "system packages"
      fi
      ;;
    dnf)
      if confirm "Install the equivalent packages with $SUDO dnf?"; then
        run "install system packages" $SUDO dnf install -y \
          git curl unzip zip wget java-17-openjdk-devel qemu-kvm \
          || FAILED_STAGES+=("system")
      else
        skip "system packages"
      fi
      ;;
    pacman)
      if confirm "Install the equivalent packages with $SUDO pacman?"; then
        run "install system packages" $SUDO pacman -S --needed --noconfirm \
          git curl unzip zip wget jdk17-openjdk qemu-base \
          || FAILED_STAGES+=("system")
      else
        skip "system packages"
      fi
      ;;
    *) skip "no supported package manager" ;;
  esac

  # JAVA_HOME — AGP 8.9 needs exactly JDK 17 and fails confusingly otherwise.
  JAVA_DIR="$(dirname "$(dirname "$(readlink -f "$(command -v javac 2>/dev/null || echo /usr/lib/jvm/java-17-openjdk-amd64/bin/javac)")" 2>/dev/null)" 2>/dev/null)"
  if [[ -d "$JAVA_DIR" && -x "$JAVA_DIR/bin/java" ]]; then
    persist_export "export JAVA_HOME=$JAVA_DIR"
    persist_export 'export PATH="$JAVA_HOME/bin:$PATH"'
    note "JAVA_HOME    $JAVA_DIR"
  else
    note "JAVA_HOME    not resolved yet — re-run this stage after the JDK installs"
  fi

  # KVM, only when the hardware actually offers it.
  if [[ -e /dev/kvm ]]; then
    if ! id -nG | tr ' ' '\n' | grep -qx kvm; then
      if confirm "Add $(id -un) to the kvm group (needed for a usable emulator)?"; then
        run "add $(id -un) to the kvm group" $SUDO usermod -aG kvm "$(id -un)" || true
        note "log out and back in for the group to take effect"
      fi
    else
      ok "already in the kvm group"
    fi
  else
    note "/dev/kvm absent — hardware acceleration unavailable; use a physical device"
  fi
fi

# ===========================================================================
# Stage 2 · Node.js
# ===========================================================================
if stage_selected node; then
  say "Stage 2 · Node.js $NODE_MAJOR (the API needs 20.12+ for process.loadEnvFile)"

  current_node="$(command -v node >/dev/null 2>&1 && node -v || echo none)"
  note "installed    $current_node"

  node_major_ok() {
    [[ "$current_node" == v* ]] || return 1
    local major="${current_node#v}"; major="${major%%.*}"
    [[ "$major" -ge "$NODE_MAJOR" ]]
  }

  if node_major_ok; then
    ok "Node $current_node is already new enough"
  elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    note "nvm detected — installing Node $NODE_MAJOR through it"
    if [[ $DRY_RUN -eq 0 ]]; then
      # shellcheck disable=SC1091
      . "$HOME/.nvm/nvm.sh"
      nvm install "$NODE_MAJOR" && nvm alias default "$NODE_MAJOR" && ok "Node $NODE_MAJOR installed via nvm" \
        || FAILED_STAGES+=("node")
    else
      printf '  \033[36mdry-run\033[0m nvm install %s && nvm alias default %s\n' "$NODE_MAJOR" "$NODE_MAJOR"
    fi
  else
    if confirm "Install nvm, then Node $NODE_MAJOR?"; then
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  \033[36mdry-run\033[0m curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n'
        printf '  \033[36mdry-run\033[0m nvm install %s && nvm alias default %s\n' "$NODE_MAJOR" "$NODE_MAJOR"
      else
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
          && . "$HOME/.nvm/nvm.sh" \
          && nvm install "$NODE_MAJOR" && nvm alias default "$NODE_MAJOR" \
          && ok "Node $NODE_MAJOR installed via nvm" \
          || FAILED_STAGES+=("node")
      fi
    else
      skip "Node installation"
    fi
  fi
fi

# ===========================================================================
# Stage 3 · Android SDK (headless)
# ===========================================================================
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ANDROID_TOOLS="$ANDROID_HOME/cmdline-tools/latest/bin"

if stage_selected android; then
  say "Stage 3 · Android SDK (platform $ANDROID_PLATFORM, build-tools $BUILD_TOOLS)"
  note "ANDROID_HOME $ANDROID_HOME"

  if [[ ! -x "$ANDROID_TOOLS/sdkmanager" ]]; then
    if confirm "Download the Android command-line tools into $ANDROID_HOME?"; then
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  \033[36mdry-run\033[0m wget %s\n' "$CMDLINE_TOOLS_URL"
        printf '  \033[36mdry-run\033[0m unzip into %s/cmdline-tools/latest\n' "$ANDROID_HOME"
      else
        tmp_zip="$(mktemp -d)/cmdline-tools.zip"
        mkdir -p "$ANDROID_HOME/cmdline-tools"
        if wget -q -O "$tmp_zip" "$CMDLINE_TOOLS_URL" && unzip -q -o "$tmp_zip" -d "$ANDROID_HOME/cmdline-tools"; then
          rm -rf "$ANDROID_HOME/cmdline-tools/latest"
          mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
          ok "command-line tools installed"
        else
          printf '  \033[31m✗\033[0m download or unzip failed — check CMDLINE_TOOLS_URL against developer.android.com/studio\n' >&2
          FAILED_STAGES+=("android")
        fi
      fi
    else
      skip "command-line tools"
    fi
  else
    ok "command-line tools already present"
  fi

  persist_export "export ANDROID_HOME=$ANDROID_HOME"
  persist_export 'export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"'

  if [[ -x "$ANDROID_TOOLS/sdkmanager" ]]; then
    export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")}"
    if [[ $DRY_RUN -eq 0 ]]; then
      note "accepting SDK licences (this downloads nothing on its own)"
      yes | "$ANDROID_TOOLS/sdkmanager" --licenses >/dev/null 2>&1 || true
    else
      printf '  \033[36mdry-run\033[0m yes | sdkmanager --licenses\n'
    fi
    run "install platform-tools, platform $ANDROID_PLATFORM, build-tools $BUILD_TOOLS" \
      "$ANDROID_TOOLS/sdkmanager" "platform-tools" "platforms;android-$ANDROID_PLATFORM" "build-tools;$BUILD_TOOLS" \
      || FAILED_STAGES+=("android")
  else
    note "sdkmanager unavailable — re-run this stage after the tools download"
  fi

  # Gradle needs to find the SDK; local.properties is git-ignored per machine.
  if [[ -f "$REPO_ROOT/apps/android/local.properties" ]]; then
    ok "apps/android/local.properties already exists"
  elif [[ $DRY_RUN -eq 0 ]]; then
    printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$REPO_ROOT/apps/android/local.properties"
    ok "wrote apps/android/local.properties (git-ignored)"
  else
    printf '  \033[36mdry-run\033[0m write sdk.dir=%s to apps/android/local.properties\n' "$ANDROID_HOME"
  fi
fi

# ===========================================================================
# Stage 4 · Gradle + the wrapper this repository is missing
# ===========================================================================
if stage_selected gradle; then
  say "Stage 4 · Gradle $GRADLE_VERSION and the missing wrapper"

  gradle_bin="$(command -v gradle 2>/dev/null || true)"
  if [[ -z "$gradle_bin" && -x "$HOME/gradle-$GRADLE_VERSION/bin/gradle" ]]; then
    gradle_bin="$HOME/gradle-$GRADLE_VERSION/bin/gradle"
  fi

  if [[ -n "$gradle_bin" ]]; then
    note "found        $gradle_bin"
  elif confirm "Download Gradle $GRADLE_VERSION into \$HOME?"; then
    if [[ $DRY_RUN -eq 1 ]]; then
      printf '  \033[36mdry-run\033[0m wget %s && unzip into $HOME\n' "$GRADLE_URL"
    else
      tmp="$(mktemp -d)"
      if wget -q -O "$tmp/gradle.zip" "$GRADLE_URL" && unzip -q -o "$tmp/gradle.zip" -d "$HOME"; then
        gradle_bin="$HOME/gradle-$GRADLE_VERSION/bin/gradle"
        ok "Gradle $GRADLE_VERSION extracted to $HOME"
      else
        printf '  \033[31m✗\033[0m Gradle download failed\n' >&2
        FAILED_STAGES+=("gradle")
      fi
    fi
  else
    skip "Gradle installation"
  fi

  persist_export "export PATH=\"\$HOME/gradle-$GRADLE_VERSION/bin:\$PATH\""

  # The repository ships no gradlew, so generate it once and it can be committed.
  if [[ -f "$REPO_ROOT/apps/android/gradlew" ]]; then
    ok "gradlew already present in apps/android"
  elif [[ -n "$gradle_bin" ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      printf '  \033[36mdry-run\033[0m (cd apps/android && gradle wrapper --gradle-version %s)\n' "$GRADLE_VERSION"
    else
      note "generating the wrapper (first run downloads Gradle metadata)"
      if (cd "$REPO_ROOT/apps/android" && "$gradle_bin" wrapper --gradle-version "$GRADLE_VERSION" --no-daemon); then
        ok "wrapper generated — commit apps/android/gradlew and gradle/wrapper/"
      else
        printf '  \033[31m✗\033[0m wrapper generation failed\n' >&2
        FAILED_STAGES+=("gradle")
      fi
    fi
  fi
fi

# ===========================================================================
# Stage 5 · npm dependencies
# ===========================================================================
if stage_selected deps; then
  say "Stage 5 · npm dependencies"
  if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    run "npm install" bash -c "cd '$REPO_ROOT' && npm install" || FAILED_STAGES+=("deps")
  else
    ok "node_modules already present (npm install skipped)"
    note "run 'npm install' manually if package.json has changed"
  fi
fi

# ===========================================================================
# Stage 6 · apps/api/.env
# ===========================================================================
if stage_selected env; then
  say "Stage 6 · apps/api/.env"
  if [[ -f "$REPO_ROOT/apps/api/.env" ]]; then
    ok "apps/api/.env already exists — leaving it untouched"
    note "re-run with: npm run setup:env -- --force …  to rebuild it"
  else
    if [[ -z "$POSTGRES_URL" ]]; then
      note "Neon console -> Connect -> Pooled connection (keep ?sslmode=require)"
      if [[ $DRY_RUN -eq 0 && -t 0 ]]; then
        read -r -p "  POSTGRES_URL: " POSTGRES_URL
      fi
    fi
    if [[ -z "$MIGRATIONS_URL" ]]; then
      note "Neon console -> Connect -> direct (unpooled) connection"
      if [[ $DRY_RUN -eq 0 && -t 0 ]]; then
        read -r -p "  MIGRATIONS_DATABASE_URL: " MIGRATIONS_URL
      fi
    fi

    if [[ -z "$POSTGRES_URL" || -z "$MIGRATIONS_URL" ]]; then
      skip "no Neon URLs supplied — pass --postgres-url and --migrations-url"
      FAILED_STAGES+=("env")
    else
      args=(--postgres-url "$POSTGRES_URL" --migrations-url "$MIGRATIONS_URL")
      [[ -n "$SUPPORT_EMAIL" ]] && args+=(--support-email "$SUPPORT_EMAIL")
      # The URLs are not echoed: setup-env prints them, so pipe that away.
      note "running setup-env (Firebase values are read from google-services.json;"
      note "JWT_SECRET and OTP_HASH_SECRET are generated locally and never printed)"
      if [[ $DRY_RUN -eq 1 ]]; then
        printf '  \033[36mdry-run\033[0m npm run setup:env -- --postgres-url <hidden> --migrations-url <hidden>\n'
      elif (cd "$REPO_ROOT" && npm run --silent setup:env -- "${args[@]}" >/dev/null); then
        ok "apps/api/.env created (mode 600)"
      else
        printf '  \033[31m✗\033[0m setup:env failed\n' >&2
        FAILED_STAGES+=("env")
      fi
    fi
  fi
fi

# ===========================================================================
# Stage 7 · verify
# ===========================================================================
if stage_selected verify; then
  say "Stage 7 · verification"
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  \033[36mdry-run\033[0m npm run verify:local\n'
  elif (cd "$REPO_ROOT" && npm run --silent verify:local); then
    ok "verify:local reported no code defects"
  else
    printf '  \033[31m✗\033[0m verify:local reported a FAIL stage — see the summary above\n' >&2
    FAILED_STAGES+=("verify")
  fi
fi

# ===========================================================================
# Stage 8 · debug APK
# ===========================================================================
if stage_selected apk && [[ $SKIP_APK -eq 0 ]]; then
  say "Stage 8 · debug APK"

  if [[ -z "$API_BASE_URL" ]]; then
    lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    note "A phone or emulator cannot use localhost — that is the device itself."
    note "emulator     http://10.0.2.2:$API_PORT"
    [[ -n "${lan_ip:-}" ]] && note "this machine on the LAN  http://${lan_ip}:$API_PORT"
    if [[ $DRY_RUN -eq 0 && -t 0 ]]; then
      read -r -p "  API_BASE_URL [http://10.0.2.2:$API_PORT]: " API_BASE_URL
    fi
    API_BASE_URL="${API_BASE_URL:-http://10.0.2.2:$API_PORT}"
  fi

  if [[ -z "$GOOGLE_WEB_CLIENT_ID" && -f "$REPO_ROOT/apps/android/app/google-services.json" ]]; then
    GOOGLE_WEB_CLIENT_ID="$(node -e '
      const s = require(process.argv[1]);
      const web = (s.client?.[0]?.oauth_client ?? []).find((c) => c.client_type === 3);
      process.stdout.write(web?.client_id ?? "");
    ' "$REPO_ROOT/apps/android/app/google-services.json" 2>/dev/null || true)"
  fi

  if [[ -z "$GOOGLE_WEB_CLIENT_ID" ]]; then
    skip "no web OAuth client id found in google-services.json — Google sign-in would be disabled"
  fi

  gradle_cmd="gradle"
  [[ -x "$REPO_ROOT/apps/android/gradlew" ]] && gradle_cmd="./gradlew"
  [[ -z "$(command -v gradle 2>/dev/null)" && ! -x "$REPO_ROOT/apps/android/gradlew" ]] \
    && [[ -x "$HOME/gradle-$GRADLE_VERSION/bin/gradle" ]] \
    && gradle_cmd="$HOME/gradle-$GRADLE_VERSION/bin/gradle"

  note "API_BASE_URL $API_BASE_URL"
  note "EMAIL_LINK_URL $EMAIL_LINK_URL"

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  \033[36mdry-run\033[0m (cd apps/android && %s :app:assembleDebug -PAPI_BASE_URL=%s -PGOOGLE_WEB_CLIENT_ID=<from google-services.json> -PEMAIL_LINK_URL=%s)\n' \
      "$gradle_cmd" "$API_BASE_URL" "$EMAIL_LINK_URL"
  elif (cd "$REPO_ROOT/apps/android" && "$gradle_cmd" :app:assembleDebug --no-daemon \
          -PAPI_BASE_URL="$API_BASE_URL" \
          -PGOOGLE_WEB_CLIENT_ID="$GOOGLE_WEB_CLIENT_ID" \
          -PEMAIL_LINK_URL="$EMAIL_LINK_URL"); then
    apk="$REPO_ROOT/apps/android/app/build/outputs/apk/debug/app-debug.apk"
    ok "APK built: $apk"
    note "install with: adb install -r $apk"
  else
    printf '  \033[31m✗\033[0m the APK build failed — this is the first real compile of the Kotlin sources\n' >&2
    FAILED_STAGES+=("apk")
  fi
fi

# ===========================================================================
# Summary
# ===========================================================================
say "Summary"
note "stages run    ${ONLY:-all}"
note "dry run       $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no)"

if [[ ${#FAILED_STAGES[@]} -eq 0 ]]; then
  printf '  \033[32m✓\033[0m no stage failed\n'
else
  printf '  \033[31m✗\033[0m failed stage(s): %s\n' "${FAILED_STAGES[*]}"
fi

cat <<EOF

Next:
  npm run verify:local          re-check everything at any time
  npm run dev:api               start the API on port $API_PORT
  adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk

If you generated the Gradle wrapper, commit it so nobody else has to:
  git add apps/android/gradlew apps/android/gradlew.bat apps/android/gradle/wrapper
  git commit -m "Add the Gradle wrapper"

Docs: docs/12_Linux_Setup.md · docs/11_Local_Testing.md · docs/10_Firebase_Console_Checklist.md
EOF

[[ ${#FAILED_STAGES[@]} -eq 0 ]] || exit 1
