// lib/pipeline.js
// The daily pipeline in one place. Two things run it:
//   - scripts/run-pipeline.mjs (the VPS cron job, plain Node, no web server)
//   - app/api/run/route.js (manual runs on your own PC)
//
// fetch -> filter -> dedup -> score -> write to sheet -> process approvals
// (sending email applications) -> follow-ups -> daily digest.

import { fetchAllJobs } from "./fetchers/index.js";
import { filterJobs, deduplicate } from "./filters.js";
import { scoreAll, computeMatchScore } from "./scorer.js";
import { findApplyEmail } from "./emailApply.js";
import {
  addJobs,
  getExistingLinks,
  getJobsByStatus,
  updateStatus,
  setFollowUpDate,
  getDueFollowUps,
  STATUS,
} from "./sheets.js";
import { sendDailyDigest, sendFollowUpReminder } from "./mailer.js";
import { sendApplication } from "./autoApply.js";

const MAX_NEW_ROWS_PER_RUN = 50;

const RESUME_FILENAME_BY_LABEL = {
  frontend_engineer: "Daniel_Chimezie_CV_Frontend_Engineer.pdf",
  react_native: "Daniel_Chimezie_CV_React_Native_Developer.pdf",
  product_engineer: "Daniel_Chimezie_CV_Product_Engineer.pdf",
};

// Returns { success, log } or { success: false, error, log }. Never throws.
export async function runPipeline() {
  // Settings are read when the run starts, so changes to .env.local apply.
  const minimumScore = Number(process.env.MINIMUM_MATCH_SCORE || 55);
  const autoApproveMin = Number(process.env.AUTO_APPROVE_MIN_SCORE || 80);
  const autoSendEmails = process.env.AUTO_SEND_EMAILS === "true";
  const maxEmails = Number(process.env.MAX_EMAILS_PER_RUN || 10);

  const log = [];
  const pushLog = (msg) => {
    console.log(msg);
    log.push(msg);
  };

  try {
    // --- fetch, filter, dedup ---
    pushLog("=== Fetching jobs from all sources ===");
    // Every source's jobs get a quick check (country and score) the moment
    // they arrive, so thousands of jobs that could never pass never pile up
    // in memory. The full checks below still run on what is kept.
    const keepCandidate = (job) =>
      filterJobs([job]).length === 1 && computeMatchScore(job) >= minimumScore;
    const fetched = await fetchAllJobs(keepCandidate);
    pushLog(
      `Jobs seen: ${fetched.total}, kept after the early check: ${fetched.jobs.length}`,
    );

    const eligibleJobs = filterJobs(fetched.jobs);
    pushLog(`After country filter: ${eligibleJobs.length}`);

    const existingLinks = await getExistingLinks();
    const newJobs = deduplicate(eligibleJobs, existingLinks);
    pushLog(`After removing duplicates already in sheet: ${newJobs.length}`);

    // --- score ---
    const scoredJobs = scoreAll(newJobs, minimumScore);
    pushLog(
      `After minimum match score (${minimumScore}): ${scoredJobs.length}`,
    );

    // --- write best matches in one batch ---
    const toAdd = [...scoredJobs]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_NEW_ROWS_PER_RUN);

    const autoApproved = [];
    let emailJobs = 0;
    const rowsToAdd = toAdd.map((job) => {
      const applyEmail = findApplyEmail(job.description);
      if (applyEmail) emailJobs++;

      const strong = job.matchScore >= autoApproveMin && !job.needsManualReview;

      // strong match + application email -> sent automatically only when
      // AUTO_SEND_EMAILS=true, otherwise it waits for your Approve click.
      // strong match with a web form -> Needs Manual Apply (you submit it).
      let status = STATUS.AWAITING_APPROVAL;
      if (strong && applyEmail) {
        if (autoSendEmails) status = STATUS.APPROVED;
      } else if (strong) {
        status = STATUS.NEEDS_MANUAL;
      }
      if (status === STATUS.NEEDS_MANUAL) autoApproved.push(job);

      return {
        company: job.company || "",
        roleTitle: job.title || "",
        employmentType: job.employmentType || "Not specified",
        countryRemote: job.location || "",
        estSalary: "Not listed",
        matchScore: job.matchScore,
        cvVersion: job.cvVersion,
        link: job.link || "",
        submissionMethod: applyEmail ? "Email" : "Unknown (check posting)",
        status,
        notes: [
          status !== STATUS.AWAITING_APPROVAL
            ? `Auto-approved (score ${job.matchScore})`
            : "",
          job.needsManualReview ? "Flagged for manual CV review" : "",
          job.locationRestricted
            ? "Check location eligibility before applying"
            : "",
          applyEmail ? `Apply by email: ${applyEmail}` : "",
        ]
          .filter(Boolean)
          .join(". "),
      };
    });
    await addJobs(rowsToAdd);
    pushLog(
      `Added ${rowsToAdd.length} new rows (${autoApproved.length} auto-approved, ${emailJobs} with an application email).`,
    );

    // --- process approved jobs: send email applications, queue the rest ---
    const approved = await getJobsByStatus(STATUS.APPROVED);
    const autoAppliedToday = [];
    const needsManualApply = [];
    let emailsSent = 0;

    for (const row of approved) {
      const method = (row["Submission Method"] || "").trim().toLowerCase();
      const emailMatch = (row.Notes || "").match(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );

      if (method === "email" && emailMatch) {
        // Over the per-run cap: leave it Approved, it goes out next run.
        if (emailsSent >= maxEmails) continue;

        const success = await sendApplication(
          {
            title: row["Role Title"] || "",
            company: row.Company || "",
            resumeFile:
              RESUME_FILENAME_BY_LABEL[row["CV Version Used"]] ||
              RESUME_FILENAME_BY_LABEL.frontend_engineer,
          },
          emailMatch[0],
        );
        if (success) {
          emailsSent++;
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
      `Emails sent: ${autoAppliedToday.length}, Needs manual: ${needsManualApply.length}`,
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

    return { success: true, log };
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    return { success: false, error: err.message, log };
  }
}
