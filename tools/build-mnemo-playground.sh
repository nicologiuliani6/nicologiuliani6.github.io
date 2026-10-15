#!/usr/bin/env bash
# Copies Mnemo (and pcpp, which replaces `gcc -E` in the browser) into
# docs/mnemo/play/py/ for the in-browser playground. The Kairos frontend and
# the VM come from docs/kairos/play/: run build-kairos-playground.sh first.
#
# Usage: tools/build-mnemo-playground.sh [path/to/mnemo] [path/to/kairos]
#        (defaults ../mnemo and ../kairos; the Kairos venv provides pip)
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
MNEMO="$(cd "${1:-$SITE/../mnemo}" && pwd)"
KAIROS="$(cd "${2:-$SITE/../kairos}" && pwd)"
OUT="$SITE/docs/mnemo/play/py"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
"$KAIROS/venv/bin/python" -m pip install -q --target "$TMP" pcpp==1.30

rm -rf "$OUT"
mkdir -p "$OUT/mnemo/lib" "$OUT/mnemo/fake_include"
cp "$MNEMO"/mnemo/*.py "$OUT/mnemo/"
cp "$MNEMO"/mnemo/lib/*.kairos "$OUT/mnemo/lib/"
cp "$MNEMO"/mnemo/fake_include/*.h "$OUT/mnemo/fake_include/"
cp -r "$TMP/pcpp" "$OUT/pcpp"
find "$OUT" -name '__pycache__' -prune -exec rm -rf {} +

( cd "$OUT" && find . -type f | sed 's#^\./##' | sort ) > "$OUT/files.txt"

# The VM worker must live under this page's service-worker scope (/docs/mnemo/):
# Firefox blocks worker scripts from outside it for missing COEP headers.
cp "$SITE"/docs/kairos/play/{vm-worker.js,kairos-vm.js,kairos-vm.wasm} "$SITE/docs/mnemo/play/"
echo "playground built from $MNEMO ($(git -C "$MNEMO" rev-parse --short HEAD))"
