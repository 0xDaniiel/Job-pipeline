#!/bin/bash
# run-daily.sh
# What cron runs every day. It starts the pipeline gently so it can never
# hurt the other services on this server:
#   - lowest CPU priority (nice 19)
#   - V8 memory capped at 256 MB
#   - if the server ever runs out of memory, Linux kills THIS script first,
#     not your bots (oom_score_adj 1000)
# Output is appended to logs/run.log (trimmed to the last 2000 lines).

cd "$(dirname "$0")" || exit 1
mkdir -p logs

if [ -f logs/run.log ]; then
  tail -n 2000 logs/run.log > logs/run.log.tmp && mv logs/run.log.tmp logs/run.log
fi

echo 1000 > /proc/$$/oom_score_adj 2>/dev/null

exec nice -n 19 node --max-old-space-size=256 --env-file=.env.local scripts/run-pipeline.mjs >> logs/run.log 2>&1
