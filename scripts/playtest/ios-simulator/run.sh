#!/usr/bin/env bash
# Drives REAL Mobile Safari in the iOS Simulator through the DigiTable signed-out forms and the GM
# correction sheet, with the software keyboard up, in portrait and landscape, and the native <select>
# picker; writes screenshots and element-vs-keyboard frame measurements. A Simulator is NOT a physical
# device (see README.md); this tool exists because headless Chrome cannot shrink only the visual viewport
# the way iOS does for the keyboard.
#
#   scripts/playtest/ios-simulator/run.sh [--base URL] [--out DIR] ["iPhone 17 Pro" "iPad mini (A17 Pro)" ...]
#
# Needs Xcode with iOS Simulator runtimes, and the app + emulators already running on this Mac's loopback:
# the Firebase emulators (auth, firestore, functions) plus a `vite preview` of a build made with
# VITE_FIREBASE_USE_EMULATOR=true (see README.md; a Simulator reaches the Mac at 127.0.0.1). Do not use
# scripts/playtest/lan-up.sh for this: it binds the unauthenticated emulators to every interface.
# Nothing is installed on a device; no credentials are used. Refuses a non-loopback --base unless
# --allow-remote is given, because the flows create rooms.
set -euo pipefail
cd "$(dirname "$0")"

BASE="${DIGITABLE_BASE:-http://127.0.0.1:4173}"
OUT="${DIGITABLE_OUT:-/private/tmp/digitable-ios-playtest}"
DEVICES=()
ALLOW_REMOTE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --allow-remote) ALLOW_REMOTE=1; shift ;;
    *) DEVICES+=("$1"); shift ;;
  esac
done

# The flows create real rooms with a fixed passphrase. Against the local emulators that is nothing; against
# a deployed project it is data in a real database, so a non-loopback base needs an explicit opt-in.
# A strict match (not a glob): "http://localhost:80@evil.example" must not pass as loopback.
LOOPBACK='^http://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+(/[^@]*)?$'
if ! [[ "$BASE" =~ $LOOPBACK ]] && [ "$ALLOW_REMOTE" -ne 1 ]; then
  echo "Refusing non-loopback base $BASE (it would create rooms there). Pass --allow-remote to override." >&2
  exit 1
fi
[ ${#DEVICES[@]} -eq 0 ] && DEVICES=("iPhone 17 Pro")

if ! curl -fs -o /dev/null "$BASE/"; then
  echo "Nothing is serving $BASE. Start the app and the emulators first (see this file's header)." >&2
  exit 1
fi

DERIVED="${TMPDIR:-/tmp}/digitable-ios-playtest-dd"
mkdir -p "$OUT"

# "<udid> <runtime>" of the newest available runtime's simulator with this exact name.
udid_for() {
  xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
found = [(runtime, d["udid"]) for runtime, devs in json.load(sys.stdin)["devices"].items() for d in devs if d["name"] == name]
if not found:
    sys.exit(1)
runtime, udid = sorted(found)[-1]
print(udid, runtime.rsplit(".", 1)[-1])' "$1"
}

STATUS=0
BOOTED_HERE=()
# Shut down only the simulators this script booted, including on Ctrl-C.
cleanup() {
  for u in ${BOOTED_HERE[@]+"${BOOTED_HERE[@]}"}; do xcrun simctl shutdown "$u" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM
for device in "${DEVICES[@]}"; do
  if ! found="$(udid_for "$device")"; then
    echo "No available simulator named \"$device\" (xcrun simctl list devices available)." >&2
    STATUS=1
    continue
  fi
  udid="${found%% *}"
  runtime="${found#* }"
  tag="$(echo "$device" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed 's/--*/-/g; s/^-//; s/-$//')"
  echo "== $device on $runtime ($udid) -> $OUT/$tag"
  if ! xcrun simctl list devices booted | grep -q "$udid"; then
    xcrun simctl boot "$udid" 2>/dev/null || true
    BOOTED_HERE+=("$udid")
  fi
  xcrun simctl bootstatus "$udid" >/dev/null 2>&1
  if TEST_RUNNER_DIGITABLE_BASE="$BASE" TEST_RUNNER_DIGITABLE_OUT="$OUT/$tag" TEST_RUNNER_DIGITABLE_TAG="$tag" \
    xcodebuild test -project IosPlaytest.xcodeproj -scheme IosPlaytest \
      -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$DERIVED" \
      CODE_SIGNING_ALLOWED=NO > "$OUT/$tag-xcodebuild.log" 2>&1; then
    echo "   passed"
  else
    echo "   FAILED (see $OUT/$tag-xcodebuild.log)"
    STATUS=1
  fi
done
exit $STATUS
