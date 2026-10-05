// sheets.js
// All reads/writes to the "Job Applications Tracker" Google Sheet.
// Every other part of the pipeline imports this rather than calling the
// Sheets API directly.
//
// Requires in .env.local:
//   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json
//   GOOGLE_SPREADSHEET_ID=the-id-from-your-sheet-url
//   GOOGLE_SHEET_TAB=Sheet1   (optional, defaults to Sheet1)

import { google } from "googleapis";

const COLUMNS = [
  "Date Found", "Company", "Role Title", "Employment Type",
  "Country/Remote", "Est. Salary", "Match Score", "CV Version Used",
  "Link", "Submission Method", "Status", "Follow-up Date", "Notes",
];

export const STATUS = {
  NEW: "New",
  AWAITING_APPROVAL: "Awaiting Your Approval",
  APPROVED: "Approved",
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
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB || "Sheet1";
  if (!keyFile || !spreadsheetId) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_PATH and GOOGLE_SPREADSHEET_ID must be set in .env.local"
    );
  }
  return { keyFile, spreadsheetId, tab };
}

async function getClient() {
  if (cachedClient) return cachedClient;
  const { keyFile } = getConfig();
  const auth = new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
  const authClient = await auth.getClient();
  cachedClient = google.sheets({ version: "v4", auth: authClient });
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

export async function addJob(job) {
  const sheets = await getClient();
  const { spreadsheetId, tab } = getConfig();
  await ensureHeader();

  const row = [
    new Date().toISOString().slice(0, 10),
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

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  return res.data.updates?.updatedRange || null;
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

export async function jobAlreadyExists(link) {
  if (!link) return false;
  const all = await getAllJobs();
  return all.some((j) => j.Link === link);
}
