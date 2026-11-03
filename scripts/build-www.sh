#!/usr/bin/env bash
# Builds the web bundle that goes inside the Android app (Capacitor webDir = www/).
# Three.js is downloaded into www/vendor so the app works offline from its very first launch.
set -euo pipefail
cd "$(dirname "$0")/.."

CDN="https://cdn.jsdelivr.net/npm/three@0.147.0"
FILES=(
  build/three.min.js
  examples/js/shaders/CopyShader.js
  examples/js/shaders/LuminosityHighPassShader.js
  examples/js/postprocessing/EffectComposer.js
  examples/js/postprocessing/RenderPass.js
  examples/js/postprocessing/ShaderPass.js
  examples/js/postprocessing/MaskPass.js
  examples/js/postprocessing/UnrealBloomPass.js
  examples/js/utils/BufferGeometryUtils.js
  examples/js/loaders/GLTFLoader.js
)

rm -rf www
mkdir -p www/vendor
cp -r index.html css js icons manifest.webmanifest www/
# Blender characters (models/<id>.glb), if any; the starter files in models/templates stay out of the app
mkdir -p www/models
if ls models/*.glb >/dev/null 2>&1; then cp models/*.glb www/models/; fi
# the list the game reads to know which characters have a model
( cd www/models && printf '[%s]\n' "$(ls *.glb 2>/dev/null | sed 's/.*/"&"/' | paste -sd, -)" ) > www/models/index.json
for f in "${FILES[@]}"; do
  curl -fsSL "$CDN/$f" -o "www/vendor/$(basename "$f")"
done
# point the script tags at the bundled copies
sed -i -E "s#${CDN}/(build|examples/js/[a-z]+)/#vendor/#g" www/index.html

if grep -q "cdn.jsdelivr.net" www/index.html; then
  echo "error: some CDN scripts were not rewritten" >&2
  exit 1
fi
echo "www/ ready: $(find www -type f | wc -l) files"
