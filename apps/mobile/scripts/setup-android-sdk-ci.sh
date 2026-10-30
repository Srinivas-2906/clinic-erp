#!/usr/bin/env bash
# Install Android SDK cmdline tools on GitHub Actions ubuntu (Job A).
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
sudo mkdir -p "$ANDROID_HOME/cmdline-tools"

if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/cmdline-tools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q "$TMP/cmdline-tools.zip" -d "$TMP"
  sudo rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  sudo mv "$TMP/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$TMP"
fi

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;26.1.10909125"

echo "ANDROID_HOME=$ANDROID_HOME" >> "${GITHUB_ENV}"
echo "PATH=$PATH" >> "${GITHUB_ENV}"
