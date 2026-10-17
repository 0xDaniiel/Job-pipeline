// Deletes every job row (header stays). Disabled unless ALLOW_CLEAR=true.
import { NextResponse } from "next/server";
import { clearAllJobs } from "../../../lib/sheets.js";

export async function POST() {
  if (process.env.ALLOW_CLEAR !== "true") {
    return NextResponse.json(
      { error: "Clearing is disabled. Set ALLOW_CLEAR=true in .env.local." },
      { status: 403 },
    );
  }
  try {
    await clearAllJobs();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
