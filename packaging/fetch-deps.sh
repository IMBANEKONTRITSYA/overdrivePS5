#!/usr/bin/env bash
# Seeds ps5-react/.deps with the two pinned dependencies whose upstream repositories are gone from
# GitHub (blackbearreloaded/ps5-homebrew-ui and the ps5-opengl SDK release), from public mirrors.
# The build itself does the checking: tools/common.py refuses a platform checkout that is not the
# pinned revision plus the repository's patches, and a tarball whose sha256 is not the pinned one,
# so a mirror can only supply the exact bytes the lock file names. Nothing in ps5-react/ changes.
#
# Run from anywhere; idempotent. Pass alternative mirrors through PLATFORM_MIRRORS / OPENGL_MIRRORS
# (space-separated) if these disappear too.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
deps="$root/ps5-react/.deps"
lock="$root/ps5-react/dependencies.lock.json"

platform_rev=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["platform"]["revision"])' "$lock")
opengl_sha=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["ps5OpenGL"]["sha256"])' "$lock")

# Forks that still carry the pinned commit (checked 2026-11-12). JVK3R's are archived, so they stay put.
read -r -a platform_mirrors <<< "${PLATFORM_MIRRORS:-https://github.com/JVK3R/ps5-homebrew-ui.git https://github.com/Skystar9999/ps5-homebrew-ui-mirror.git https://github.com/Phononenom/ps5-homebrew-ui.git https://github.com/J7mbo/ps5-homebrew-ui.git}"
read -r -a opengl_mirrors <<< "${OPENGL_MIRRORS:-https://github.com/JVK3R/ps5-opengl/releases/download/v1.0.0/ps5-opengl-sdk-1.0.0.tar.gz}"

mkdir -p "$deps"

platform="$deps/platform"
if [ ! -d "$platform/.git" ]; then
  for url in "${platform_mirrors[@]}"; do
    echo "platform: trying $url"
    scratch=$(mktemp -d "$deps/platform.XXXXXX")
    if git clone --quiet "$url" "$scratch" && git -C "$scratch" checkout --quiet --detach "$platform_rev"; then
      mv "$scratch" "$platform"
      break
    fi
    echo "platform: $url does not serve $platform_rev"
  done
fi
actual=$(git -C "$platform" rev-parse HEAD 2>/dev/null || true)
if [ "$actual" != "$platform_rev" ]; then
  echo "platform: no mirror served revision $platform_rev" >&2
  exit 1
fi
echo "platform: $platform at $actual"

tarball="$deps/ps5-opengl-sdk-1.0.0.tar.gz"
if [ ! -f "$tarball" ]; then
  for url in "${opengl_mirrors[@]}"; do
    echo "ps5-opengl: trying $url"
    if curl -fsSL --retry 3 -o "$tarball.download" "$url" && echo "$opengl_sha  $tarball.download" | sha256sum --check --quiet; then
      mv "$tarball.download" "$tarball"
      break
    fi
    echo "ps5-opengl: $url did not give the pinned archive"
  done
fi
echo "$opengl_sha  $tarball" | sha256sum --check --quiet || { echo "ps5-opengl: no mirror served the archive with sha256 $opengl_sha" >&2; exit 1; }
echo "ps5-opengl: $tarball verified"
