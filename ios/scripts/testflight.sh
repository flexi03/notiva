#!/bin/zsh
# Builds the iPhone/iPad app and uploads it to TestFlight (team 6728DRMDL9).
# Needs: Xcode signed in with the Apple ID (Xcode → Settings → Accounts) and the app record
# "io.github.flexi03.notiva.ios" in App Store Connect. Build numbers count up by themselves.
set -e
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
OUT=${TMPDIR:-/tmp}/notiva-ios-release
rm -rf "$OUT" && mkdir -p "$OUT"
xcodegen >/dev/null
cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>6728DRMDL9</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><true/>
</dict></plist>
PLIST
xcodebuild -project Notiva.xcodeproj -scheme Notiva -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Notiva.xcarchive" -allowProvisioningUpdates archive | grep -E "error:|ARCHIVE"
xcodebuild -exportArchive -archivePath "$OUT/Notiva.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" -allowProvisioningUpdates | grep -E "error|Upload|EXPORT"
echo "Hochgeladen – in ein paar Minuten in TestFlight."
