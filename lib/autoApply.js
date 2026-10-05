// autoApply.js
// Handles the ONE submission path that's safely automatable: jobs whose
// application method is a plain email address. Attaches the correct
// tailored resume (picked by scorer.js) and sends a short, honest note.
//
// LIMITATION: only works for jobs where Submission Method is "Email" and
// an address appears in the Notes column (convention: "apply: jobs@co.com").
// Everything else correctly falls to "Needs Manual Apply" per the plan.

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const RESUMES_DIR = path.join(process.cwd(), "resumes");

const NOTE_TEMPLATE = (roleTitle, company, name, linkedin, github, portfolio) => `Hi,

I'm applying for the ${roleTitle} role at ${company}. I've attached my resume, tailored to this kind of role.

A quick summary of relevant experience: 5+ years building production web and mobile products in React, TypeScript, Next.js, and React Native, including measurable performance improvements and shipped products with real users.

Happy to share more detail or jump on a call whenever convenient.

Best,
${name}
${linkedin}
${github}
${portfolio}
`;

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_SERVER || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
}

export async function sendApplication(job, recipientEmail) {
  const resumePath = path.join(RESUMES_DIR, job.resumeFile || "");
  if (!fs.existsSync(resumePath)) {
    console.warn(`[autoApply] Resume not found: ${resumePath}, skipping ${job.company}`);
    return false;
  }

  const name = process.env.YOUR_NAME || "Daniel Chimezie";
  const linkedin = process.env.YOUR_LINKEDIN || "";
  const github = process.env.YOUR_GITHUB || "";
  const portfolio = process.env.YOUR_PORTFOLIO || "";

  const text = NOTE_TEMPLATE(job.title || "the role", job.company || "your team", name, linkedin, github, portfolio);

  try {
    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_EMAIL,
      to: recipientEmail,
      subject: `Application: ${job.title || "Open Role"} - ${name}`,
      text,
      attachments: [
        {
          filename: path.basename(resumePath),
          path: resumePath,
        },
      ],
    });
    console.log(`[autoApply] Sent application to ${job.company} (${recipientEmail})`);
    return true;
  } catch (err) {
    console.warn(`[autoApply] FAILED to send to ${job.company}: ${err.message}`);
    return false;
  }
}
