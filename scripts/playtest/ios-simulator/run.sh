#!/usr/bin/env bash
# Drives REAL Mobile Safari in the iOS Simulator through the DigiTable signed-out forms and the GM
# correction sheet, with the software keyboard up, in portrait and landscape, and the native <select>
# picker; writes screenshots and element-vs-keyboard frame measurements. A Simulator is NOT a physical
# device (see README.md); this tool exists because headless Chrome cannot shrink only the visual viewport
# the way iOS does for the keyboard.
#
#   scripts/playtest/ios-simulator/run.sh [--base URL] [--out DIR] ["iPhone 17 Pro" "iPad mini (A17 Pro)" ...]
#
# Needs Xcode with iOS Simulator runtimes, and the app + emulators already running, e.g. the emulator
# build served by `scripts/playtest/lan-up.sh` (http://127.0.0.1:4173) or any `vite preview` of a build
# made with VITE_FIREBASE_USE_EMULATOR=true. Nothing is installed on a device; no credentials are used.
set -euo pipefail
cd "$(dirname "$0")"

BASE="${DIGITABLE_BASE:-http://127.0.0.1:4173}"
OUT="${DIGITABLE_OUT:-/private/tmp/digitable-ios-playtest}"
DEVICES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    *) DEVICES+=("$1"); shift ;;
  esac
done
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
  xcrun simctl boot "$udid" 2>/dev/null || true
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
