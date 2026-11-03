#!/usr/bin/env bash
# Generates the Android (Capacitor) project from www/ and applies the game's tweaks:
# fullscreen activity, landscape lock and launcher icons. Run scripts/build-www.sh first.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --no-save --no-audit --no-fund @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7
rm -rf android
npx cap add android

# fullscreen (no status / navigation bars)
cp android-src/MainActivity.java android/app/src/main/java/com/powerbooster/gp/MainActivity.java

# landscape only, either way up
MANIFEST=android/app/src/main/AndroidManifest.xml
sed -i 's#android:name=".MainActivity"#android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"#' "$MANIFEST"
grep -q 'sensorLandscape' "$MANIFEST" || { echo "error: could not set landscape orientation" >&2; exit 1; }

# launcher icons: plain PNGs per density (drop the adaptive-icon XML so these are used)
RES=android/app/src/main/res
if convert -version 2>/dev/null | grep -q ImageMagick; then   # (Windows has an unrelated convert.exe)
  rm -rf "$RES/mipmap-anydpi-v26"
  for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    dir="$RES/mipmap-${d%%:*}"; px="${d##*:}"
    mkdir -p "$dir"
    convert icons/icon-512.png -resize "${px}x${px}" "$dir/ic_launcher.png"
    convert icons/icon-512.png -resize "${px}x${px}" "$dir/ic_launcher_round.png"
    convert icons/icon-512.png -resize "${px}x${px}" "$dir/ic_launcher_foreground.png"
  done
else
  echo "warning: ImageMagick not found, keeping Capacitor's default icons" >&2
fi

npx cap sync android
echo "android/ ready"
