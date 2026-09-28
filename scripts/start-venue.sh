#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export VENUE_SERVER_URL="${VENUE_SERVER_URL:-https://smartphonocracy-venue-server.enabler.space}"
export MEDIA_DIR="${MEDIA_DIR:-$PWD/venue-media}"
export PORT="${PORT:-3000}"

if [[ ! -d "$MEDIA_DIR" ]]; then
  echo "Venue media folder not found: $MEDIA_DIR" >&2
  echo "Copy the supplied video folder to $PWD/venue-media, or set MEDIA_DIR to its location." >&2
  exit 1
fi

exec node --import tsx scripts/serve-venue-display.mts
