// scripts/send-alert.mjs
// Sends one alert email. run-daily.sh uses it when the pipeline dies in a way
// it could not report itself (for example the server killed it for using too
// much memory).
//
//   node --env-file=.env.local scripts/send-alert.mjs "Subject" "Message"

import { sendAlert } from "../lib/mailer.js";

const [subject, ...rest] = process.argv.slice(2);
const sent = await sendAlert(
  subject || "Job pipeline alert",
  rest.join(" ") || "No details given.",
);
process.exit(sent ? 0 : 1);
