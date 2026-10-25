// app/api/jobs/route.js
// Returns every row from the sheet as JSON, for the dashboard to render.

import { NextResponse } from "next/server";
import { getAllJobs } from "../../../lib/sheets.js";

// Without this, a production build would run this once and keep serving the
// same list forever. The dashboard must always read the live sheet.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
