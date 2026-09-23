#!/usr/bin/env bash
# Run on macOS with Xcode. Cannot produce an IPA on Windows.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${VITE_API_BASE:-}" ]]; then
  echo "Warning: VITE_API_BASE is empty. Set it to your Cloud Run URL." >&2
fi

npm run build:mobile
npx cap sync ios
echo "Open Xcode, then Product → Archive → Distribute App:"
echo "  npx cap open ios"
