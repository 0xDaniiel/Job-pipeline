// app/api/run/route.js
// The daily pipeline endpoint, called by cron (see cron/daily-run.sh).
// fetch -> filter -> dedup -> score -> write to sheet (auto-approving high
// matches) -> process approvals -> follow-ups -> daily digest.
// Protected by a shared secret: curl -X POST URL -H "x-cron-secret: SECRET"

import { NextResponse } from "next/server";
import { fetchAllJobs } from "../../../lib/fetchers/index.js";
import { filterJobs, deduplicate } from "../../../lib/filters.js";
import { scoreAll } from "../../../lib/scorer.js";
import {
  addJobs,
  getExistingLinks,
  getJobsByStatus,
  updateStatus,
  setFollowUpDate,
  getDueFollowUps,
  STATUS,
} from "../../../lib/sheets.js";
import { sendDailyDigest, sendFollowUpReminder } from "../../../lib/mailer.js";
import { sendApplication } from "../../../lib/autoApply.js";

const MINIMUM_MATCH_SCORE = Number(process.env.MINIMUM_MATCH_SCORE || 55);
const AUTO_APPROVE_MIN_SCORE = Number(process.env.AUTO_APPROVE_MIN_SCORE || 80);
const MAX_NEW_ROWS_PER_RUN = 50;

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
    // --- fetch, filter, dedup ---
    pushLog("=== Fetching jobs from all sources ===");
    const rawJobs = await fetchAllJobs();
    pushLog(`Total raw jobs found: ${rawJobs.length}`);

    const eligibleJobs = filterJobs(rawJobs);
    pushLog(`After country/salary filter: ${eligibleJobs.length}`);

    const existingLinks = await getExistingLinks();
    const newJobs = deduplicate(eligibleJobs, existingLinks);
    pushLog(`After removing duplicates already in sheet: ${newJobs.length}`);

    // --- score ---
    const scoredJobs = scoreAll(newJobs, MINIMUM_MATCH_SCORE);
    pushLog(
      `After minimum match score (${MINIMUM_MATCH_SCORE}): ${scoredJobs.length}`,
    );

    // --- write best matches in one batch, auto-approving strong ones ---
    const toAdd = [...scoredJobs]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_NEW_ROWS_PER_RUN);

    const autoApproved = [];
    const rowsToAdd = toAdd.map((job) => {
      const auto =
        job.matchScore >= AUTO_APPROVE_MIN_SCORE && !job.needsManualReview;
      if (auto) autoApproved.push(job);
      return {
        company: job.company || "",
        roleTitle: job.title || "",
        employmentType: job.employmentType || "Not specified",
        countryRemote: job.location || "",
        estSalary: "Not listed",
        matchScore: job.matchScore,
        cvVersion: job.cvVersion,
        link: job.link || "",
        submissionMethod: "Unknown (check posting)",
        status: auto ? STATUS.NEEDS_MANUAL : STATUS.AWAITING_APPROVAL,
        notes: auto
          ? `Auto-approved (score ${job.matchScore})`
          : job.needsManualReview
            ? "Flagged for manual CV review"
            : "",
      };
    });
    await addJobs(rowsToAdd);
    pushLog(
      `Added ${rowsToAdd.length} new rows (${autoApproved.length} auto-approved).`,
    );

    // --- process jobs you approved by hand ---
    const approved = await getJobsByStatus(STATUS.APPROVED);
    const autoAppliedToday = [];
    const needsManualApply = [];

    for (const row of approved) {
      const submissionMethod = (row["Submission Method"] || "")
        .trim()
        .toLowerCase();
      const notes = row.Notes || "";
      const emailMatch = notes.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);

      if (submissionMethod === "email" && emailMatch) {
        const jobForApply = {
          title: row["Role Title"] || "",
          company: row.Company || "",
          resumeFile:
            RESUME_FILENAME_BY_LABEL[row["CV Version Used"]] ||
            RESUME_FILENAME_BY_LABEL.frontend_engineer,
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
    pushLog(
      `Auto-applied: ${autoAppliedToday.length}, Needs manual: ${needsManualApply.length}`,
    );

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
      needsManualApply: [...autoApproved, ...needsManualApply],
      autoAppliedToday,
    });
    pushLog("Daily digest sent.");

    return NextResponse.json({ success: true, log });
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    return NextResponse.json(
      { success: false, error: err.message, log },
      { status: 500 },
    );
  }
}
