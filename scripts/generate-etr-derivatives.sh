#!/usr/bin/env bash
# C04 (issue #14): generates apps/web/public/etr/*.webp derivatives from the
# preserved source PNGs in assets/generated/eat-the-reich/, per
# docs/ETR_ART_BRIEF.md sections 3-4.
#
# Deliberately does NOT use `sharp` or any npm image library: it is not in
# package-lock.json (Sonnet A owns that file) and this branch does not add
# dependencies. Uses two local command-line tools instead, run by hand on
# the machine that produced these derivatives — neither is a project
# dependency, so nothing here is reproducible from `npm install` alone:
#   - `sips` (macOS built-in) for resizing
#   - `cwebp` (Homebrew: `brew install webp`) for WebP encoding
# If Sonnet A wants derivative generation reproducible in CI, `sharp` (or
# an equivalent already-audited package) should be proposed and added to
# package-lock.json there; this script is a one-time/local substitute.
#
# Written for bash 3.2 (macOS's default /bin/bash has no associative
# arrays) — uses plain "id:filename" pairs instead.
#
# Run from the repo root: bash scripts/generate-etr-derivatives.sh

set -euo pipefail

SRC="assets/generated/eat-the-reich"
OUT="apps/web/public/etr"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

resize_webp() {
  local src="$1" width="$2" out="$3" quality="${4:-82}"
  sips -Z "$width" "$src" --out "$TMP/step.png" >/dev/null
  cwebp -quiet -q "$quality" "$TMP/step.png" -o "$OUT/$out"
}

echo "Roster portraits (card + token)..."
for pair in \
  "rook:rook-portrait.png" \
  "vesper:vesper-portrait.png" \
  "halloran:halloran-portrait.png" \
  "orsolya:orsolya-portrait.png" \
  "delphine:delphine-portrait.png" \
  "tallow:tallow-portrait.png"
do
  id="${pair%%:*}"
  file="${pair#*:}"
  src="$SRC/$file"
  resize_webp "$src" 512 "${id}-512.webp"
  resize_webp "$src" 256 "${id}-256.webp"
  resize_webp "$src" 128 "${id}-token-128.webp"
  echo "  $id done"
done

echo "Scene backgrounds..."
for pair in \
  "drop-forecourt:scene-drop-forecourt.png" \
  "metro-platform:metro-location.png" \
  "printworks:scene-printworks.png" \
  "signal-mast:scene-signal-mast.png"
do
  id="${pair%%:*}"
  file="${pair#*:}"
  src="$SRC/$file"
  resize_webp "$src" 1536 "scene-${id}-1536.webp" 78
  resize_webp "$src" 1024 "scene-${id}-1024.webp" 80
  resize_webp "$src" 640 "${id}-640.webp"
  echo "  $id done"
done

echo "Threat portraits (card + token)..."
for pair in \
  "threat-enforcer:enforcer-threat.png" \
  "threat-warden:threat-warden.png" \
  "threat-patrol:threat-patrol.png" \
  "threat-rifle-squad:threat-rifle-squad.png" \
  "threat-plated-squad:threat-plated-squad.png" \
  "threat-marksman-nest:threat-marksman-nest.png" \
  "threat-armoured-truck:threat-armoured-truck.png"
do
  id="${pair%%:*}"
  file="${pair#*:}"
  src="$SRC/$file"
  resize_webp "$src" 256 "${id}-256.webp"
  resize_webp "$src" 128 "${id}-128.webp"
  echo "  $id done"
done

echo "Hero..."
resize_webp "$SRC/campaign-hero.png" 1600 "hero-1600.webp" 80
resize_webp "$SRC/campaign-hero.png" 1000 "hero-1000.webp"
resize_webp "$SRC/campaign-hero.png" 600 "hero-600.webp"

echo "Done. Derivatives written to $OUT/"
du -sh "$OUT" | cat
