// app/api/approve/route.js
// Updates a row's Status when you click a button on the dashboard.
// Body: { row: 5, status: "Approved" }

import { NextResponse } from "next/server";
import { updateStatus, STATUS } from "../../../lib/sheets.js";

const ALLOWED_STATUSES = new Set(Object.values(STATUS));

export async function POST(request) {
  try {
    const body = await request.json();
    const { row, status } = body;

    if (!row || !status) {
      return NextResponse.json({ error: "row and status are required" }, { status: 400 });
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}` }, { status: 400 });
    }

    await updateStatus(Number(row), status);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
