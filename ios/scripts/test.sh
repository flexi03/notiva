#!/bin/zsh
# Runs the app's tests on iPhone 18 Pro Max, iPhone Duo and iPad Pro 13" against a stand-in Mac
# (scripts/fake-mac.ts) and keeps the screenshots for the App Store in AppStore/screenshots/.
#   ./scripts/test.sh            all devices
#   ./scripts/test.sh "iPad Pro 13-inch (M5)"
set -e
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
OUT=${TMPDIR:-/tmp}/notiva-ios-test
rm -rf "$OUT" && mkdir -p "$OUT"
xcodegen >/dev/null
if (( $# )); then DEVICES=("$@"); else DEVICES=("iPhone 18 Pro Max" "iPhone Duo" "iPad Pro 13-inch (M5)"); fi
stop_fake() { pkill -f "ios/scripts/fake-mac.ts" 2>/dev/null || true; }
trap stop_fake EXIT
HOST=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
failed=0
for device in "${DEVICES[@]}"; do
  slug=${device//[^A-Za-z0-9]/}
  # A fresh stand-in Mac per device: what one device's tests change is not in the next one's screenshots.
  stop_fake
  (cd .. && PORT=47999 npx tsx ios/scripts/fake-mac.ts > "$OUT/fake-mac-$slug.log" 2>&1) &
  sleep 3
  xcrun simctl boot "$device" 2>/dev/null || true
  # A clean status bar for the screenshots (9:41, full battery).
  xcrun simctl status_bar "$device" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4 2>/dev/null || true
  echo "▶ $device"
  if TEST_RUNNER_FAKE_MAC_HOST="$HOST" xcodebuild -project Notiva.xcodeproj -scheme Notiva \
      -destination "platform=iOS Simulator,name=$device" -derivedDataPath "$OUT/dd" \
      -resultBundlePath "$OUT/$slug.xcresult" test > "$OUT/$slug.log" 2>&1; then
    echo "  ✓ alle Tests grün"
  else
    failed=1
    grep -E "error:|failed \(" "$OUT/$slug.log" | head -8
  fi
  mkdir -p "$OUT/shots-$slug" "AppStore/screenshots/$slug"
  xcrun xcresulttool export attachments --path "$OUT/$slug.xcresult" --output-path "$OUT/shots-$slug" >/dev/null 2>&1 || true
  python3 - "$OUT/shots-$slug" "AppStore/screenshots/$slug" <<'PY'
import json, shutil, sys, os
src, dst = sys.argv[1], sys.argv[2]
try:
    manifest = json.load(open(os.path.join(src, 'manifest.json')))
except FileNotFoundError:
    sys.exit(0)
for test in manifest:
    for a in test['attachments']:
        name = a.get('suggestedHumanReadableName', '')
        # Only the named ones ("01-heute" …), not failure snapshots.
        if name[:2].isdigit() and a['exportedFileName'].endswith('.png'):
            shutil.copy(os.path.join(src, a['exportedFileName']), os.path.join(dst, name.split('_')[0] + '.png'))
PY
  # One simulator at a time – several at once overload the Mac (system apps time out).
  xcrun simctl shutdown "$device" 2>/dev/null || true
done
exit $failed
