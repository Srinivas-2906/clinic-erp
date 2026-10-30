#!/usr/bin/env bash
# Install Maestro CLI for CI (pinned release, no curl|bash installer).
set -euo pipefail

MAESTRO_VERSION="${MAESTRO_VERSION:-1.39.9}"
MAESTRO_HOME="${MAESTRO_HOME:-$HOME/.maestro}"
BIN="$MAESTRO_HOME/bin/maestro"

if [[ -x "$BIN" ]]; then
  "$BIN" --version
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

zip="$tmpdir/maestro.zip"
url="https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip"
echo "==> Download Maestro CLI ${MAESTRO_VERSION}"
curl -fsSL "$url" -o "$zip"
unzip -q "$zip" -d "$tmpdir"
mkdir -p "$MAESTRO_HOME/bin"
cp -a "$tmpdir/maestro/bin/"* "$MAESTRO_HOME/bin/"
chmod +x "$BIN"
"$BIN" --version
