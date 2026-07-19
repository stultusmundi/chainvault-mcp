#!/usr/bin/env bash
# Transpile TypeScript to dist using esbuild
# tsc OOMs on viem types, so we use esbuild for transpilation
# Type checking: npx tsc --noEmit (separate step)

set -e

echo "Cleaning dist directories..."
rm -rf packages/core/dist packages/cli/dist

echo "Building @chainvault/core..."
find packages/core/src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" | while read f; do
  outdir="packages/core/dist/$(dirname "${f#packages/core/src/}")"
  mkdir -p "$outdir"
  npx esbuild "$f" --format=esm --outdir="$outdir" --log-level=warning
done

echo "Building @chainvault/cli..."
find packages/cli/src \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.test.ts" ! -name "*.test.tsx" ! -name "*.e2e.test.ts" ! -name "*.e2e.test.tsx" ! -name "test-helpers.ts" ! -name "*.d.ts" | while read f; do
  outdir="packages/cli/dist/$(dirname "${f#packages/cli/src/}")"
  mkdir -p "$outdir"
  npx esbuild "$f" --format=esm --jsx=automatic --outdir="$outdir" --log-level=warning
done

echo "Build complete."
