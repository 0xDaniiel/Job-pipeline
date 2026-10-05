#!/bin/bash
# setup_cron.sh
#
# Installs a daily cron job that calls daily-run.sh every morning at 7:00 AM
# server time. Run this ONCE after confirming the app runs correctly with
# `npm run build && npm run start` and /api/run works when called manually.
#
# Usage:
#   chmod +x cron/setup_cron.sh cron/daily-run.sh
#   ./cron/setup_cron.sh

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_LINE="0 7 * * * $PROJECT_DIR/cron/daily-run.sh"

echo "Project directory detected as: $PROJECT_DIR"
echo ""
echo "About to install this cron line:"
echo "  $CRON_LINE"
echo ""
read -p "Proceed? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. No changes made."
    exit 0
fi

mkdir -p "$PROJECT_DIR/logs"

( crontab -l 2>/dev/null | grep -v "$PROJECT_DIR/cron/daily-run.sh" ; echo "$CRON_LINE" ) | crontab -

echo "Cron job installed. Check it with: crontab -l"
echo "Logs will appear in: $PROJECT_DIR/logs/run.log"
echo ""
echo "IMPORTANT: this only works while the Next.js app is running persistently."
echo "See README 'Deploying for real' for the PM2 setup."
