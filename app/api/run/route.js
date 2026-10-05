// app/api/run/route.js
//
// The daily orchestrator endpoint. This is the ONE route cron calls every
// morning (see cron/daily-run.sh). It ties every module together in order:
//
//   1. Fetch jobs from every source (lib/fetchers)
//   2. Filter by country/salary eligibility (lib/filters)
//   3. Drop anything already in the sheet (lib/filters, dedup)
//   4. Score each job and pick the right CV (lib/scorer)
//   5. Write new matches to the sheet as "Awaiting Your Approval" (lib/sheets)
//   6. Check for jobs marked "Approved" since the last run:
//        - Submission Method "Email" with an address in Notes -> auto-apply
//        - otherwise -> "Needs Manual Apply", surfaced in the digest
//   7. Check for due follow-ups
//   8. Send one daily digest email covering all of the above
//
// Protected by a shared secret so random internet traffic can't trigger it.
// Call with: curl -X POST https://yourdomain/api/run -H "x-cron-secret: YOUR_SECRET"

import { NextResponse } from "next/server";
import { fetchAllJobs } from "../../../lib/fetchers/index.js";
import { filterJobs, deduplicateAgainstSheet } from "../../../lib/filters.js";
import { scoreAll } from "../../../lib/scorer.js";
import {
  addJob, getJobsByStatus, updateStatus, setFollowUpDate, getDueFollowUps,
  jobAlreadyExists, STATUS,
} from "../../../lib/sheets.js";
import { sendDailyDigest, sendFollowUpReminder } from "../../../lib/mailer.js";
import { sendApplication } from "../../../lib/autoApply.js";

const MINIMUM_MATCH_SCORE = Number(process.env.MINIMUM_MATCH_SCORE || 55);

const RESUME_FILENAME_BY_LABEL = {
  frontend_engineer: "Daniel_Chimezie_CV_Frontend_Engineer.pdf",
  react_native: "Daniel_Chimezie_CV_React_Native_Developer.pdf",
  product_engineer: "Daniel_Chimezie_CV_Product_Engineer.pdf",
};

function checkAuth(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured, skip check (fine for local testing)
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log = [];
  const pushLog = (msg) => {
    console.log(msg);
    log.push(msg);
  };

  try {
    pushLog("=== Fetching jobs from all sources ===");
    const rawJobs = await fetchAllJobs();
    pushLog(`Total raw jobs found: ${rawJobs.length}`);

    const eligibleJobs = filterJobs(rawJobs);
    pushLog(`After country/salary filter: ${eligibleJobs.length}`);

    const newJobs = await deduplicateAgainstSheet(eligibleJobs, { jobAlreadyExists });
    pushLog(`After removing duplicates already in sheet: ${newJobs.length}`);

    const scoredJobs = scoreAll(newJobs, MINIMUM_MATCH_SCORE);
    pushLog(`After minimum match score (${MINIMUM_MATCH_SCORE}): ${scoredJobs.length}`);

    for (const job of scoredJobs) {
      await addJob({
        company: job.company || "",
        roleTitle: job.title || "",
        employmentType: job.employmentType || "Not specified",
        countryRemote: job.location || "",
        estSalary: "Not listed",
        matchScore: job.matchScore,
        cvVersion: job.cvVersion,
        link: job.link || "",
        submissionMethod: "Unknown (check posting)",
        status: STATUS.AWAITING_APPROVAL,
        notes: job.needsManualReview ? "Flagged for manual CV review" : "",
      });
    }
    pushLog(`Added ${scoredJobs.length} new rows to the sheet.`);

    // --- process approvals ---
    const approved = await getJobsByStatus(STATUS.APPROVED);
    const autoAppliedToday = [];
    const needsManualApply = [];

    for (const row of approved) {
      const submissionMethod = (row["Submission Method"] || "").trim().toLowerCase();
      const notes = row.Notes || "";
      const emailMatch = notes.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);

      if (submissionMethod === "email" && emailMatch) {
        const jobForApply = {
          title: row["Role Title"] || "",
          company: row.Company || "",
          resumeFile: RESUME_FILENAME_BY_LABEL[row["CV Version Used"]] || RESUME_FILENAME_BY_LABEL.frontend_engineer,
        };
        const success = await sendApplication(jobForApply, emailMatch[0]);
        if (success) {
          await updateStatus(row._row, STATUS.APPLIED_AUTO);
          await setFollowUpDate(row._row, 7);
          autoAppliedToday.push(row);
          continue;
        }
      }

      await updateStatus(row._row, STATUS.NEEDS_MANUAL);
      needsManualApply.push(row);
    }
    pushLog(`Auto-applied: ${autoAppliedToday.length}, Needs manual: ${needsManualApply.length}`);

    // --- follow-ups due today ---
    const dueFollowUps = await getDueFollowUps();
    if (dueFollowUps.length) {
      await sendFollowUpReminder(dueFollowUps);
      for (const row of dueFollowUps) {
        await updateStatus(row._row, STATUS.FOLLOWUP_SENT);
      }
    }
    pushLog(`Follow-ups sent: ${dueFollowUps.length}`);

    // --- daily digest ---
    const stillAwaiting = await getJobsByStatus(STATUS.AWAITING_APPROVAL);
    await sendDailyDigest({
      needsApproval: stillAwaiting,
      needsManualApply,
      autoAppliedToday,
    });
    pushLog("Daily digest sent.");

    return NextResponse.json({ success: true, log });
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
  }
}
