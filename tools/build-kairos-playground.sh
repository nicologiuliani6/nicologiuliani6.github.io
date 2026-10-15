#!/usr/bin/env bash
# Rebuilds the in-browser Kairos playground in docs/kairos/play/:
# the VM compiled to WebAssembly (Emscripten, pthreads) and a copy of the
# Python frontend + PLY, which the page runs in Pyodide.
#
# Usage: tools/build-kairos-playground.sh [path/to/kairos]   (default ../kairos)
# Needs emsdk: source ~/emsdk/emsdk_env.sh
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
KAIROS="$(cd "${1:-$SITE/../kairos}" && pwd)"
OUT="$SITE/docs/kairos/play"

command -v emcc >/dev/null || { echo "emcc not found: source ~/emsdk/emsdk_env.sh" >&2; exit 1; }

emcc -O2 -DNDEBUG -pthread \
  "$KAIROS/src/vm/Janus.c" "$KAIROS/src/vm/Janus_dap.c" -I"$KAIROS/src/vm" \
  -sMODULARIZE=1 -sEXPORT_NAME=KairosVM -sENVIRONMENT=worker \
  -sEXPORTED_FUNCTIONS=_vm_run_from_string -sEXPORTED_RUNTIME_METHODS=stringToNewUTF8,ENV \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sSTACK_SIZE=16MB \
  -sDEFAULT_PTHREAD_STACK_SIZE=4MB -sPTHREAD_POOL_SIZE=8 -sEXIT_RUNTIME=0 \
  -Wno-pthreads-mem-growth \
  -o "$OUT/kairos-vm.js"

PLY="$(ls -d "$KAIROS"/venv/lib/python*/site-packages/ply | head -1)"
rm -rf "$OUT/py"
mkdir -p "$OUT/py/src/frontend" "$OUT/py/ply"
cp "$KAIROS/src/__init__.py" "$OUT/py/src/"
cp "$KAIROS"/src/frontend/*.py "$OUT/py/src/frontend/"
cp "$PLY"/__init__.py "$PLY"/lex.py "$PLY"/yacc.py "$OUT/py/ply/"

( cd "$OUT/py" && find . -name '*.py' | sed 's#^\./##' | sort ) > "$OUT/py/files.txt"
echo "playground built from $KAIROS ($(git -C "$KAIROS" rev-parse --short HEAD))"
