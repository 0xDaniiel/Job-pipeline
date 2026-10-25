// app/api/run/route.js
// Manual pipeline run from your own PC (the VPS cron job uses
// scripts/run-pipeline.mjs instead). Protected by CRON_SECRET.
// Call with: curl -X POST http://localhost:3000/api/run -H "x-cron-secret: YOUR_SECRET"

import { NextResponse } from "next/server";
import { runPipeline } from "../../../lib/pipeline.js";

function checkAuth(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured, skip check (fine for local testing)
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPipeline();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
