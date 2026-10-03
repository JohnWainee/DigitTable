#!/usr/bin/env bash
# Runs the real-Mobile-Safari UI tests in a DEDICATED iOS Simulator device (created and removed here, so a
# device someone else is using is never touched) against an emulator-mode DigiTable build, while
# page-logger-server.mjs records the page's own visualViewport / sheet geometry.
#
#   scripts/playtest/ios-keyboard/run.sh --dist "${TMPDIR:-/tmp}/digitable-ios-dist" [--out DIR] [--port 4175]
#       [--device "iPhone 17 Pro"] [--runtime iOS-26-5] [--test testCorrectionSheetWithRealKeyboard]...
#       [--keep-device]
#
# Needs (see README.md): Xcode with an iOS Simulator runtime; the Firebase emulators running on their default
# ports; and --dist built with VITE_FIREBASE_USE_EMULATOR=true. Nothing is installed on a device and no
# credential or Firebase project is involved (the emulator project id is a fake `demo-` one).
set -euo pipefail
# Relative --dist/--out are relative to where this was run from, not to this directory.
CALLER_PWD="$PWD"
cd "$(dirname "$0")"

DIST=""
OUT="${TMPDIR:-/tmp}/digitable-ios-keyboard"
PORT=4175
DEVICE="iPhone 17 Pro"
RUNTIME_SUFFIX=""
KEEP=0
TESTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dist) DIST="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --device) DEVICE="$2"; shift 2 ;;
    --runtime) RUNTIME_SUFFIX="$2"; shift 2 ;;
    --test) TESTS+=("$2"); shift 2 ;;
    --keep-device) KEEP=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
# An empty value must stay empty (not become the caller's directory) so the checks below can refuse it.
case "$DIST" in ""|/*) ;; *) DIST="$CALLER_PWD/$DIST" ;; esac
case "$OUT" in ""|/*) ;; *) OUT="$CALLER_PWD/$OUT" ;; esac
[ -n "$DIST" ] && [ -f "$DIST/index.html" ] || { echo "--dist must be a built apps/web directory (index.html missing)" >&2; exit 2; }
[ -n "$OUT" ] || { echo "--out must not be empty" >&2; exit 2; }
[ ${#TESTS[@]} -eq 0 ] && TESTS=(testCorrectionSheetWithRealKeyboard testSecretEntryOnRealIOSSoftKeyboard testNativeValidationOnEmptySubmit testNativeSelectPicker)
mkdir -p "$OUT"
DIST="$(cd "$DIST" && pwd)"
OUT="$(cd "$OUT" && pwd)"

# The newest available iOS runtime, or the one named by --runtime (for example iOS-26-5).
RUNTIME="$(xcrun simctl list runtimes -j | RUNTIME_SUFFIX="$RUNTIME_SUFFIX" python3 -c '
import json, os, sys
want = os.environ.get("RUNTIME_SUFFIX", "")
runtimes = [r for r in json.load(sys.stdin)["runtimes"]
            if r.get("isAvailable") and r["identifier"].split(".")[-1].startswith("iOS")
            and (not want or r["identifier"].endswith("." + want))]
runtimes.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
print(runtimes[-1]["identifier"] if runtimes else "")')"
[ -n "$RUNTIME" ] || { echo "No matching iOS Simulator runtime is installed." >&2; exit 1; }

cleanup() {
  # A second Ctrl-C or TERM while cleaning up must not leave the dedicated device behind.
  trap '' INT TERM
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  if [ -n "${UDID:-}" ] && [ "$KEEP" -eq 0 ]; then
    xcrun simctl shutdown "$UDID" 2>/dev/null || true
    xcrun simctl delete "$UDID" 2>/dev/null || true
  fi
}
# A signal must END the script (the EXIT trap then cleans up), not just run cleanup and carry on.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node page-logger-server.mjs --dir "$DIST" --port "$PORT" --log "$OUT/page-log.jsonl" >"$OUT/page-logger-server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 20); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.5; done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || { echo "page-logger-server did not start (port $PORT busy?)" >&2; exit 1; }

UDID="$(xcrun simctl create "digitable-ios-keyboard-$$" "$DEVICE" "$RUNTIME")"
echo "== $DEVICE ($RUNTIME) -> dedicated device $UDID; output $OUT"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1
# A reused Simulator can keep running an older installed copy of the test runner.
xcrun simctl uninstall "$UDID" dev.digitable.iosplaytest.uitests.xctrunner >/dev/null 2>&1 || true

ONLY=()
for t in "${TESTS[@]}"; do ONLY+=("-only-testing:IosPlaytestUITests/SafariFlowUITests/$t"); done
STATUS=0
TEST_RUNNER_DIGITABLE_BASE="http://127.0.0.1:$PORT" TEST_RUNNER_DIGITABLE_OUT="$OUT" TEST_RUNNER_DIGITABLE_TAG="ios" \
  xcodebuild test -project IosPlaytest.xcodeproj -scheme IosPlaytest \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$OUT/derived" \
    "${ONLY[@]}" CODE_SIGNING_ALLOWED=NO >"$OUT/xcodebuild.log" 2>&1 || STATUS=$?
if [ "$STATUS" -eq 0 ]; then echo "   passed"; else echo "   FAILED (see $OUT/xcodebuild.log)"; fi
echo "   screenshots + *.log: $OUT   page geometry: $OUT/page-log.jsonl"
exit "$STATUS"
