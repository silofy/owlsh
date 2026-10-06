#!/bin/sh
# Install owlsh capture agent (Linux / macOS / Pwnbox).
#
#   curl -fsSL https://raw.githubusercontent.com/silofy/owlsh/main/install.sh | sh
#
# Downloads the prebuilt binary for this OS/CPU from the latest GitHub release, verifies it against
# the release's SHA256SUMS, and installs it as `owlsh`. No Rust toolchain, no root.
#
#   OWLSH_VERSION=v0.1.0      install a specific release instead of the latest
#   OWLSH_BIN_DIR=/some/dir   install somewhere other than ~/.local/bin
set -eu

REPO="silofy/owlsh"
VERSION="${OWLSH_VERSION:-${WATCHER_VERSION:-latest}}"  # WATCHER_* = pre-rename names
BIN_DIR="${OWLSH_BIN_DIR:-${WATCHER_BIN_DIR:-$HOME/.local/bin}}"

say() { printf '%s\n' "$*"; }
die() { printf 'owlsh install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Linux)
    case "$(uname -m)" in
      x86_64 | amd64) ASSET="owlsh-linux-x86_64" ;;
      aarch64 | arm64) ASSET="owlsh-linux-aarch64" ;;
      *) die "no prebuilt binary for Linux $(uname -m) — build from source: https://github.com/$REPO#install" ;;
    esac ;;
  Darwin) ASSET="owlsh-macos-universal" ;;
  *) die "unsupported OS $(uname -s) — on Windows use install.ps1" ;;
esac

if [ "$VERSION" = "latest" ]; then
  BASE="https://github.com/$REPO/releases/latest/download"
else
  BASE="https://github.com/$REPO/releases/download/$VERSION"
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  die "needs curl or wget"
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  die "needs sha256sum or shasum to verify the download"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

say "Downloading $ASSET ($VERSION)…"
fetch "$BASE/$ASSET" "$TMP/$ASSET" || die "download failed: $BASE/$ASSET"
fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS" || die "download failed: $BASE/SHA256SUMS"

want="$(awk -v f="$ASSET" '$2 == f || $2 == "*"f {print $1}' "$TMP/SHA256SUMS")"
[ -n "$want" ] || die "$ASSET is not listed in SHA256SUMS"
got="$(sha "$TMP/$ASSET")"
[ "$want" = "$got" ] || die "checksum mismatch for $ASSET (expected $want, got $got) — not installing"
say "Checksum verified."

mkdir -p "$BIN_DIR"
chmod 755 "$TMP/$ASSET"
mv "$TMP/$ASSET" "$BIN_DIR/owlsh"
mkdir -p "$HOME/.owlsh-exports"  # where Pwnbox sync pulls finished runs from

say ""
say "Installed: $BIN_DIR/owlsh"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "Note: $BIN_DIR isn't on your PATH. Add it with:"
     say "  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.profile && . ~/.profile" ;;
esac
say ""
say "Capture a run (hack as normal, type 'exit' to finish):"
say "  owlsh --export ~/.owlsh-exports/run.json --platform htb --target <box>"
say ""
say "Then open it in owlsh app, or let Pwnbox sync pull it in automatically."
