// sheets.js
// All reads/writes to the "Job Applications Tracker" Google Sheet.
// Every other part of the pipeline imports this rather than calling the
// Sheets API directly.
//
// Requires in .env.local (or the host's environment variables):
//   GOOGLE_SPREADSHEET_ID=the-id-from-your-sheet-url
//   GOOGLE_SHEET_TAB=Sheet1   (optional, defaults to Sheet1)
// and ONE of these for the service account key:
//   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json   (your PC and the VPS)
//   GOOGLE_SERVICE_ACCOUNT_JSON={...the key as one line...}   (Vercel)

import fs from "fs";
import { sheets as sheetsApi, auth as googleAuth } from "@googleapis/sheets";

const COLUMNS = [
  "Date Found",
  "Company",
  "Role Title",
  "Employment Type",
  "Country/Remote",
  "Est. Salary",
  "Match Score",
  "CV Version Used",
  "Link",
  "Submission Method",
  "Status",
  "Follow-up Date",
  "Notes",
];

export const STATUS = {
  NEW: "New",
  AWAITING_APPROVAL: "Awaiting Your Approval",
  APPROVED: "Approved",
  APPLIED: "Applied",
  APPLIED_AUTO: "Applied (Auto)",
  NEEDS_MANUAL: "Needs Manual Apply",
  FOLLOWUP_SENT: "Follow-up Sent",
  INTERVIEW: "Interview",
  REJECTED: "Rejected",
  NO_RESPONSE: "No Response",
};

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

let cachedClient = null;

function getConfig() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Sheet1";
  if ((!keyFile && !keyJson) || !spreadsheetId) {
    throw new Error(
      "Set GOOGLE_SPREADSHEET_ID and either GOOGLE_SERVICE_ACCOUNT_KEY_PATH (a file) or GOOGLE_SERVICE_ACCOUNT_JSON (the key as text, used on Vercel)",
    );
  }
  return { keyFile, keyJson, spreadsheetId, tab };
}

async function getClient() {
  if (cachedClient) return cachedClient;
  const { keyFile, keyJson } = getConfig();
  const key = JSON.parse(keyJson || fs.readFileSync(keyFile, "utf-8"));
  const jwt = new googleAuth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
  cachedClient = sheetsApi({ version: "v4", auth: jwt });
  return cachedClient;
}

function rowsToObjects(rows) {
  if (!rows || rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map((row, i) => {
    const obj = { _row: i + 2 }; // +2: 1-indexed, plus header row
    header.forEach((colName, idx) => {
      obj[colName] = row[idx] || "";
    });
    return obj;
  });
}

function jobToRow(job, today) {
  return [
    today,
    job.company || "",
    job.roleTitle || "",
    job.employmentType || "",
    job.countryRemote || "",
    job.estSalary || "",
    job.matchScore ?? "",
    job.cvVersion || "",
    job.link || "",
    job.submissionMethod || "",
    job.status || STATUS.AWAITING_APPROVAL,
    "", // Follow-up Date, set later once applied
    job.notes || "",
  ];
}

export async function ensureHeader() {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:M1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [COLUMNS] },
    });
  }
}

// Adds a single job row. For many jobs at once, use addJobs() instead.
export async function addJob(job) {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  await ensureHeader();

  const today = new Date().toISOString().slice(0, 10);
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [jobToRow(job, today)] },
  });

  return res.data.updates?.updatedRange || null;
}

// Adds many jobs in ONE API call, so a big run doesn't hit Google's rate limit.
export async function addJobs(jobs) {
  if (!jobs.length) return;
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  await ensureHeader();

  const today = new Date().toISOString().slice(0, 10);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: jobs.map((job) => jobToRow(job, today)) },
  });
}

export async function getAllJobs() {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A:M`,
  });
  return rowsToObjects(res.data.values || []);
}

export async function getJobsByStatus(status) {
  const all = await getAllJobs();
  return all.filter((j) => j.Status === status);
}

// Reads the sheet ONCE and returns every link already tracked (for dedup).
export async function getExistingLinks() {
  const all = await getAllJobs();
  return new Set(all.map((j) => j.Link).filter(Boolean));
}

export async function updateStatus(rowNumber, newStatus) {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  const col = COLUMNS.indexOf("Status") + 1; // 1-indexed -> K
  const colLetter = String.fromCharCode(64 + col);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!${colLetter}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[newStatus]] },
  });
}

export async function setFollowUpDate(rowNumber, daysFromNow = 7) {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  const col = COLUMNS.indexOf("Follow-up Date") + 1; // -> L
  const colLetter = String.fromCharCode(64 + col);
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const dateStr = date.toISOString().slice(0, 10);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!${colLetter}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[dateStr]] },
  });
}

export async function getDueFollowUps() {
  const today = new Date().toISOString().slice(0, 10);
  const closed = new Set([STATUS.REJECTED, STATUS.FOLLOWUP_SENT]);
  const all = await getAllJobs();
  return all.filter((j) => {
    const fu = j["Follow-up Date"];
    return fu && fu <= today && !closed.has(j.Status);
  });
}

// Deletes every job row but keeps the header row.
export async function clearAllJobs() {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!A2:M`,
  });
}

// One-time styling: navy header, frozen top row, column widths, and colored
// status cells. Run it once; running it again duplicates the color rules.
export async function formatSheet() {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets.find((s) => s.properties.title === tab);
  if (!sheet) throw new Error(`Tab "${tab}" not found`);
  const sheetId = sheet.properties.sheetId;

  // Pixel widths for columns A to M, in the same order as COLUMNS.
  const widths = [
    100, 140, 300, 120, 160, 100, 90, 150, 260, 150, 170, 110, 240,
  ];

  const statusRule = (text, color) => ({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [
          {
            sheetId,
            startRowIndex: 1,
            startColumnIndex: 10, // column K (Status)
            endColumnIndex: 11,
          },
        ],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: text }] },
          format: { backgroundColor: color },
        },
      },
    },
  });

  const requests = [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.12, green: 0.16, blue: 0.33 },
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
            verticalAlignment: "MIDDLE",
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "CLIP",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
      },
    },
    ...widths.map((px, i) => ({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: i,
          endIndex: i + 1,
        },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    })),
    statusRule("Awaiting Your Approval", { red: 1, green: 0.95, blue: 0.8 }),
    statusRule("Approved", { red: 0.85, green: 0.91, blue: 1 }),
    statusRule("Applied", { red: 0.85, green: 0.95, blue: 0.87 }),
    statusRule("Applied (Auto)", { red: 0.85, green: 0.95, blue: 0.87 }),
    statusRule("Needs Manual Apply", { red: 1, green: 0.9, blue: 0.8 }),
    statusRule("Interview", { red: 0.93, green: 0.88, blue: 1 }),
    statusRule("Rejected", { red: 0.98, green: 0.85, blue: 0.85 }),
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}
