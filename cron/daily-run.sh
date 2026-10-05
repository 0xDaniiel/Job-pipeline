#!/bin/bash
# daily-run.sh
#
# Calls the running app's /api/run endpoint to trigger the daily pipeline.
# This assumes the Next.js app is already running persistently (via PM2,
# see README "Deploying for real" section) on the port below.
#
# Usage once set up: just let cron call this file. To test manually:
#   ./cron/daily-run.sh

set -e

# Edit these two if your setup differs:
APP_URL="http://localhost:3000/api/run"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"

# Pull CRON_SECRET out of .env.local so this script doesn't need its own copy
CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | cut -d '=' -f2-)

RESPONSE=$(curl -s -X POST "$APP_URL" -H "x-cron-secret: $CRON_SECRET")

echo "$(date): $RESPONSE" >> "$(dirname "${BASH_SOURCE[0]}")/../logs/run.log"
