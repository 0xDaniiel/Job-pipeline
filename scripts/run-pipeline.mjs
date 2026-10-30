// scripts/run-pipeline.mjs
// Runs the whole daily pipeline directly with Node. No web server and no
// build, so it is light enough for the VPS. The cron job runs this.
//
//   node --env-file=.env.local scripts/run-pipeline.mjs
//
// Exit codes: 0 = finished
//             2 = the run failed and an alert email was sent
//             3 = the run failed and the alert email could not be sent

import { runPipeline } from "../lib/pipeline.js";
import { sendAlert } from "../lib/mailer.js";

console.log(`[${new Date().toISOString()}] pipeline starting`);

const result = await runPipeline();

console.log(
  `[${new Date().toISOString()}] pipeline ${result.success ? "finished" : "FAILED"}`,
);
if (result.success) process.exit(0);

console.error(result.error);
const alerted = await sendAlert(
  "Job pipeline FAILED",
  `The daily run failed.\n\nReason: ${result.error}\n\nWhat it had done before failing:\n${result.log.join("\n")}`,
);
process.exit(alerted ? 2 : 3);
