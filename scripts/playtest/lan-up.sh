#!/usr/bin/env bash
# One command to stand up a private two-device playtest on this machine's LAN:
#   - Firebase emulators (auth, firestore, functions) bound to 0.0.0.0
#   - a live-mode production build of apps/web pointed at those emulators
#   - `vite preview` serving it on 0.0.0.0:4173
# No Firebase project, credential, or deploy is involved (project id `demo-digitable` is an
# offline fake). Ctrl-C stops everything.
#
# SECURITY: the emulators bind to 0.0.0.0 (every interface: Wi-Fi, VPN, hotspot) and the Firestore
# and Auth emulators have no real authentication (a caller can bypass rules with an owner token and
# wipe or read all data, including GM secrets). Only run this on a network you trust, never on
# public Wi-Fi, and stop it when the session ends.
#
# Run from a repo root that already has `npm ci` done. If this checkout lives under
# ~/Documents, macOS blocks esbuild/Firebase startup there: copy the repo to /private/tmp
# first (see docs/PLAYTEST_TWO_DEVICE.md).
#
# Optional env: LAN_IP (override detection), PORT (web port, default 4173).
set -euo pipefail
cd "$(dirname "$0")/../.."

export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
PORT="${PORT:-4173}"
if [ -z "$LAN_IP" ]; then
  echo "Could not detect a LAN IP (Wi-Fi off?). Set LAN_IP=... and retry." >&2
  exit 1
fi
if ! command -v java >/dev/null 2>&1; then
  echo "Java is required by the Firestore/RTDB emulators: brew install openjdk" >&2
  exit 1
fi

# Fake-but-valid Firebase web config: `demo-` project ids never leave the emulators.
export VITE_FIREBASE_API_KEY=demo-key
export VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com
export VITE_FIREBASE_PROJECT_ID=demo-digitable
export VITE_FIREBASE_APP_ID=1:000000000000:web:demo
export VITE_FIREBASE_USE_EMULATOR=true

# Private (mode 700) log directory instead of fixed, guessable /tmp names.
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/digitable-playtest.XXXXXX")"
EMU_LOG="$LOG_DIR/emulators.log"
WEB_LOG="$LOG_DIR/preview.log"

# NOTE: this overwrites apps/web/dist with a bundle baked to talk to plain-http emulators on the
# page's own host. Never deploy that dist; rebuild normally (`npm run build`) afterwards.
npm run build --workspace @digitable/functions >/dev/null
npm run build --workspace @digitable/web >/dev/null

npx firebase emulators:start --config firebase.lan.json \
  --only auth,firestore,functions --project demo-digitable \
  >"$EMU_LOG" 2>&1 &
EMU_PID=$!
(cd apps/web && exec npx vite preview --host 0.0.0.0 --port "$PORT" --strictPort) \
  >"$WEB_LOG" 2>&1 &
WEB_PID=$!
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  kill_tree "$EMU_PID"
  kill_tree "$WEB_PID"
}
trap cleanup EXIT INT TERM

READY=0
for _ in $(seq 1 90); do
  if grep -q "All emulators ready" "$EMU_LOG" 2>/dev/null &&
    curl -fs -o /dev/null "http://127.0.0.1:$PORT/"; then
    READY=1
    break
  fi
  if ! kill -0 "$EMU_PID" 2>/dev/null || ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "A service exited early. See $EMU_LOG and $WEB_LOG" >&2
    exit 1
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "Timed out waiting for the emulators and web server. See $EMU_LOG and $WEB_LOG" >&2
  exit 1
fi

cat <<EOF

DigiTable playtest is up (emulators + web, LAN only).

  GM (this laptop):      http://localhost:$PORT/
  Player (phone/laptop): http://$LAN_IP:$PORT/
  Table display:         http://$LAN_IP:$PORT/#/table

WARNING: the emulators are open to everyone on this network (no authentication). Trusted
networks only. Both devices must be on the same Wi-Fi as this machine. Logs: $EMU_LOG,
$WEB_LOG. Press Ctrl-C to stop everything (emulator data is discarded).
EOF
wait
