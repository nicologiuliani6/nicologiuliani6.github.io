#!/usr/bin/env bash
# Rebuilds both in-browser playgrounds (Kairos, then Mnemo) from the repos
# cloned next to this one. See /docs/playground-update/ for the full procedure.
#
# Usage: tools/update-playgrounds.sh [path/to/kairos] [path/to/mnemo]
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
KAIROS="$(cd "${1:-$SITE/../kairos}" && pwd)"
MNEMO="$(cd "${2:-$SITE/../mnemo}" && pwd)"

if ! command -v emcc >/dev/null; then
  # shellcheck disable=SC1091
  source "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1 \
    || { echo "emcc not found: install emsdk in ~/emsdk" >&2; exit 1; }
fi

for repo in "$KAIROS" "$MNEMO"; do
  if [ -n "$(git -C "$repo" status --porcelain --untracked-files=no)" ]; then
    echo "note: $repo has uncommitted changes; they go into the playground too" >&2
  fi
done

"$SITE/tools/build-kairos-playground.sh" "$KAIROS"
"$SITE/tools/build-mnemo-playground.sh" "$MNEMO" "$KAIROS"

echo
echo "Next: test locally (python3 -m http.server 8000, open /docs/kairos/ and /docs/mnemo/),"
echo "then commit docs/kairos/play and docs/mnemo/play."
