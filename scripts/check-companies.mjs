// scripts/check-companies.mjs
// Checks every company in config/companies.json against the live job-board
// APIs, so you can see which names work and drop the ones that don't.
//
//   node scripts/check-companies.mjs
//       Report only. Changes nothing.
//   node scripts/check-companies.mjs --fix
//       Also removes the names that returned 404 (not found).
//   node scripts/check-companies.mjs --add=greenhouse:dropbox,ashby:retool
//       Tries each board:name and adds the ones that exist.
//
// A name that fails for another reason (timeout, rate limit) is kept and
// marked WARN, so a bad connection never deletes a good company.

import fs from "fs";
import path from "path";

const file = path.join(process.cwd(), "config", "companies.json");
const config = JSON.parse(fs.readFileSync(file, "utf-8"));
const fix = process.argv.includes("--fix");
const addArg = process.argv.find((a) => a.startsWith("--add="));

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; job-pipeline-bot/1.0; personal use)",
};

const BOARDS = {
  greenhouse: (s) => ({
    url: `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    count: (d) => (d.jobs || []).length,
  }),
  lever: (s) => ({
    url: `https://api.lever.co/v0/postings/${s}?mode=json`,
    count: (d) => (Array.isArray(d) ? d.length : 0),
  }),
  ashby: (s) => ({
    url: `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    count: (d) => (d.jobs || []).length,
  }),
  bamboohr: (s) => ({
    url: `https://${s}.bamboohr.com/careers/list`,
    count: (d) => (d.result || []).length,
  }),
};

async function check(board, slug) {
  const { url, count } = BOARDS[board](slug);
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { status: "dead" };
    if (!res.ok) return { status: "error", detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { status: "ok", jobs: count(data) };
  } catch (err) {
    return { status: "error", detail: err.message };
  }
}

let changed = false;

// 1) Names you asked to add
if (addArg) {
  const items = addArg
    .slice("--add=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const item of items) {
    const [board, slug] = item.split(":");
    if (!BOARDS[board] || !slug) {
      console.log(
        `SKIP  ${item}  (use board:name, board is one of ${Object.keys(BOARDS).join(", ")})`,
      );
      continue;
    }
    config[board] = config[board] || [];
    if (config[board].includes(slug)) {
      console.log(`HAVE  ${board}/${slug}  already in the list`);
      continue;
    }
    const r = await check(board, slug);
    if (r.status === "ok") {
      config[board].push(slug);
      changed = true;
      console.log(`ADDED ${board}/${slug}  (${r.jobs} jobs)`);
    } else if (r.status === "dead") {
      console.log(
        `NOPE  ${board}/${slug}  not found (wrong name, or the company is not on this board)`,
      );
    } else {
      console.log(`WARN  ${board}/${slug}  ${r.detail}, not added`);
    }
  }
  console.log("");
}

// 2) Check what is already in the list
for (const board of Object.keys(BOARDS)) {
  const keep = [];
  for (const slug of config[board] || []) {
    const r = await check(board, slug);
    if (r.status === "ok") {
      console.log(`OK    ${board}/${slug}  (${r.jobs} jobs)`);
      keep.push(slug);
    } else if (r.status === "dead") {
      console.log(
        `DEAD  ${board}/${slug}  (404 not found)${fix ? "  removed" : ""}`,
      );
      if (fix) changed = true;
      else keep.push(slug);
    } else {
      console.log(`WARN  ${board}/${slug}  ${r.detail}, kept`);
      keep.push(slug);
    }
  }
  config[board] = keep;
}

if (changed) {
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  console.log("\nconfig/companies.json updated.");
} else {
  console.log(
    "\nNo changes made." +
      (fix ? "" : " Run with --fix to remove the DEAD ones."),
  );
}
