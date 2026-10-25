// scripts/run-pipeline.mjs
// Runs the whole daily pipeline directly with Node. No web server and no
// build, so it is light enough for the VPS. The cron job runs this.
//
//   node --env-file=.env.local scripts/run-pipeline.mjs
//
// Exit code 0 = finished, 1 = the run failed (the reason is printed).

import { runPipeline } from "../lib/pipeline.js";

const started = new Date();
console.log(`[${started.toISOString()}] pipeline starting`);

const result = await runPipeline();

console.log(
  `[${new Date().toISOString()}] pipeline ${result.success ? "finished" : "FAILED"}`,
);
if (!result.success) console.error(result.error);

process.exit(result.success ? 0 : 1);
