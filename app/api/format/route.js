// One-time sheet styling. Call once, see README.
import { NextResponse } from "next/server";
import { formatSheet } from "../../../lib/sheets.js";

export async function POST() {
  try {
    await formatSheet();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
