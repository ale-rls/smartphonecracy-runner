#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export VENUE_SERVER_URL="${VENUE_SERVER_URL:-https://smartphonocracy-server.enabler.space}"
export MEDIA_DIR="${MEDIA_DIR:-/Volumes/SANDISK SSD/Smartphonocracy/Masters/runner-fullHD}"
export PORT="${PORT:-3000}"
exec node --import tsx scripts/serve-venue-display.mts
