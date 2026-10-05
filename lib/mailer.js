// mailer.js
// Sends the daily digest and follow-up reminder emails via SMTP (Gmail by
// default). Requires SMTP_EMAIL + SMTP_APP_PASSWORD in .env.local.
// For Gmail this MUST be an App Password, not your normal login password:
// Google Account > Security > 2-Step Verification > App Passwords.

import nodemailer from "nodemailer";

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

async function send(subject, html) {
  const recipient = process.env.DIGEST_RECIPIENT_EMAIL || process.env.SMTP_EMAIL;
  try {
    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_EMAIL,
      to: recipient,
      subject,
      html,
    });
    console.log(`[mailer] Sent: ${subject}`);
  } catch (err) {
    console.warn(`[mailer] FAILED to send '${subject}': ${err.message}`);
  }
}

function jobRowHtml(job) {
  return `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">
        <strong>${job["Role Title"] || job.title || ""}</strong><br>
        <span style="color:#555;">${job.Company || job.company || ""}, ${job["Country/Remote"] || job.location || ""}</span><br>
        <span style="color:#777;font-size:13px;">
          Match: ${job["Match Score"] ?? job.matchScore ?? "?"}/100 |
          CV: ${job["CV Version Used"] || job.cvVersion || ""} |
          Type: ${job["Employment Type"] || job.employmentType || "Unknown"}
        </span><br>
        <a href="${job.Link || job.link || ""}">${job.Link || job.link || ""}</a>
      </td>
    </tr>
  `;
}

export async function sendDailyDigest({ needsApproval = [], needsManualApply = [], autoAppliedToday = [] }) {
  const sections = [];

  if (autoAppliedToday.length) {
    sections.push(`
      <h2 style="color:#1f2a54;">Auto-Applied Today (${autoAppliedToday.length})</h2>
      <table style="width:100%;border-collapse:collapse;">${autoAppliedToday.map(jobRowHtml).join("")}</table>
    `);
  }

  if (needsManualApply.length) {
    sections.push(`
      <h2 style="color:#1f2a54;">Needs Your Action: Manual Apply (${needsManualApply.length})</h2>
      <p style="color:#555;">Approved, but the form can't be submitted automatically. Click through and submit yourself.</p>
      <table style="width:100%;border-collapse:collapse;">${needsManualApply.map(jobRowHtml).join("")}</table>
    `);
  }

  if (needsApproval.length) {
    sections.push(`
      <h2 style="color:#1f2a54;">New Matches Awaiting Your Approval (${needsApproval.length})</h2>
      <p style="color:#555;">Open the dashboard and click Approve for any you want applied to.</p>
      <table style="width:100%;border-collapse:collapse;">${needsApproval.map(jobRowHtml).join("")}</table>
    `);
  }

  if (!sections.length) {
    sections.push("<p>No new matches, manual-apply items, or auto-applications today.</p>");
  }

  const total = needsApproval.length + needsManualApply.length + autoAppliedToday.length;
  const html = `
    <html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <h1 style="color:#1f2a54;">Your Job Search Digest</h1>
      ${sections.join("")}
      <p style="color:#999;font-size:12px;margin-top:30px;">
        Generated automatically. Review and manage everything in your Google Sheet or the dashboard.
      </p>
    </body></html>
  `;
  await send(`Job Search Digest: ${total} items today`, html);
}

export async function sendFollowUpReminder(dueJobs) {
  if (!dueJobs.length) return;
  const html = `
    <html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
      <h1 style="color:#1f2a54;">Follow-Up Reminders (${dueJobs.length})</h1>
      <p>These applications are due for a follow-up based on the date you set.</p>
      <table style="width:100%;border-collapse:collapse;">${dueJobs.map(jobRowHtml).join("")}</table>
    </body></html>
  `;
  await send(`Follow-Up Reminders: ${dueJobs.length} applications`, html);
}
