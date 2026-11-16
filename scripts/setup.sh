#!/usr/bin/env bash
set -e

# ==============================================================================
# Script: setup.sh
# Purpose: One-command project bootstrap for SecureChat
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Running SecureChat Project Setup..."

cd "${ROOT_DIR}"

# 1. Install dependencies
echo "==> Installing project dependencies..."
bun install

# 2. Run TypeScript setup script
bun run scripts/setup.ts
