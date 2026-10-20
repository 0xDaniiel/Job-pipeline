// app/api/kit/route.js
// Returns config/applyKit.json for the dashboard's Apply kit. The file is
// read on every request, so edits show up on the next refresh.

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const file = path.join(process.cwd(), "config", "applyKit.json");
    const kit = JSON.parse(fs.readFileSync(file, "utf-8"));
    return NextResponse.json({ success: true, kit });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
