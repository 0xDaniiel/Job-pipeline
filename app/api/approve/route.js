// app/api/approve/route.js
// Updates a row's Status when you click a button on the dashboard.
// Body: { row: 5, status: "Approved" }
//
// Clicking Approve acts immediately:
//   - email job (Submission Method "Email" + address in Notes): the
//     application is sent now, status becomes "Applied (Auto)" and a
//     follow-up is set 7 days out. If sending fails, the row stays
//     "Approved" and the next pipeline run retries it.
//   - any other job (web form): moves straight to "Needs Manual Apply".
// Marking a job Applied also sets a 7-day follow-up.

import { NextResponse } from "next/server";
import {
  getAllJobs,
  updateStatus,
  setFollowUpDate,
  STATUS,
} from "../../../lib/sheets.js";
import { sendApplication } from "../../../lib/autoApply.js";

export const maxDuration = 30;
const ALLOWED_STATUSES = new Set(Object.values(STATUS));
const FOLLOW_UP_STATUSES = new Set([STATUS.APPLIED, STATUS.APPLIED_AUTO]);

const RESUME_FILENAME_BY_LABEL = {
  frontend_engineer: "Daniel_Chimezie_CV_Frontend_Engineer.pdf",
  react_native: "Daniel_Chimezie_CV_React_Native_Developer.pdf",
  product_engineer: "Daniel_Chimezie_CV_Product_Engineer.pdf",
};

export async function POST(request) {
  try {
    const { row, status } = await request.json();

    if (!row || !status) {
      return NextResponse.json(
        { error: "row and status are required" },
        { status: 400 },
      );
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}` },
        { status: 400 },
      );
    }

    const rowNumber = Number(row);

    if (status === STATUS.APPROVED) {
      const all = await getAllJobs();
      const job = all.find((j) => j._row === rowNumber);
      const method = (job?.["Submission Method"] || "").trim().toLowerCase();
      const emailMatch = (job?.Notes || "").match(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );

      if (job && method === "email" && emailMatch) {
        const sent = await sendApplication(
          {
            title: job["Role Title"] || "",
            company: job.Company || "",
            resumeFile:
              RESUME_FILENAME_BY_LABEL[job["CV Version Used"]] ||
              RESUME_FILENAME_BY_LABEL.frontend_engineer,
          },
          emailMatch[0],
        );
        if (sent) {
          await updateStatus(rowNumber, STATUS.APPLIED_AUTO);
          await setFollowUpDate(rowNumber, 7);
          return NextResponse.json({ success: true, sent: true });
        }
        // Sending failed: keep it Approved so the next run retries.
        await updateStatus(rowNumber, STATUS.APPROVED);
        return NextResponse.json({ success: true, sent: false });
      }

      // Web-form job: nothing to send, go straight to the manual queue.
      await updateStatus(rowNumber, STATUS.NEEDS_MANUAL);
      return NextResponse.json({ success: true, sent: false });
    }

    await updateStatus(rowNumber, status);
    if (FOLLOW_UP_STATUSES.has(status)) {
      await setFollowUpDate(rowNumber, 7);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
