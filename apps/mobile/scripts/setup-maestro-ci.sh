#!/usr/bin/env bash
# Install Maestro CLI for CI (pinned release, full maestro/ tree with lib/).
set -euo pipefail

MAESTRO_VERSION="${MAESTRO_VERSION:-1.39.9}"
MAESTRO_HOME="${MAESTRO_HOME:-$HOME/.maestro}"
INSTALL_ROOT="$MAESTRO_HOME/maestro"
BIN="$INSTALL_ROOT/bin/maestro"

if [[ -x "$BIN" ]]; then
  if java -version >/dev/null 2>&1; then
    "$BIN" --version
  fi
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

zip="$tmpdir/maestro.zip"
url="https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip"
echo "==> Download Maestro CLI ${MAESTRO_VERSION}"
curl -fsSL "$url" -o "$zip"
mkdir -p "$MAESTRO_HOME"
rm -rf "$INSTALL_ROOT"
unzip -q "$zip" -d "$MAESTRO_HOME"
chmod +x "$BIN"
if java -version >/dev/null 2>&1; then
  "$BIN" --version
else
  echo "Maestro installed at $BIN"
fi
