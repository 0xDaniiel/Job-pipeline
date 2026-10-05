// filters.js
// Country/salary eligibility check (reads config/countries.json) and the
// dedup check against the Google Sheet.

import { loadJson } from "./loadJson.js";

const countriesConfig = loadJson(import.meta.url, "../config/countries.json");

const ELIGIBLE_COUNTRIES = new Set(
  (countriesConfig.eligible_countries || []).map((c) => c.toLowerCase())
);

const REMOTE_SIGNALS = ["remote", "worldwide", "anywhere", "global", "distributed"];

// Common abbreviations/alternate names real postings use, mapped to the
// canonical name as it appears in countries.json. Extend any time a real
// posting's location text isn't matching correctly.
const SYNONYMS = {
  uk: "united kingdom", "u.k.": "united kingdom", britain: "united kingdom",
  us: "united states", "u.s.": "united states", usa: "united states", "u.s.a.": "united states",
  uae: "united arab emirates", "u.a.e.": "united arab emirates", dubai: "united arab emirates",
  "abu dhabi": "united arab emirates",
  holland: "netherlands",
  korea: "south korea",
};

function extractNamedCountry(location) {
  const loc = location.toLowerCase();
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    if (loc.includes(alias) && ELIGIBLE_COUNTRIES.has(canonical)) return canonical;
  }
  for (const country of ELIGIBLE_COUNTRIES) {
    if (loc.includes(country)) return country;
  }
  return null;
}

function looksRemoteWorldwide(location) {
  const loc = location.toLowerCase();
  if (REMOTE_SIGNALS.some((signal) => loc.includes(signal))) {
    // "Remote - Germany" still names a country, treat as that country instead
    return !extractNamedCountry(loc);
  }
  return false;
}

export function isLocationEligible(location) {
  if (!location || location.trim() === "") {
    return { ok: true, reason: "No location specified, treated as open/remote" };
  }

  const namedCountry = extractNamedCountry(location);
  if (namedCountry) {
    return { ok: true, reason: `Named country '${namedCountry}' is on the eligible list` };
  }

  if (looksRemoteWorldwide(location)) {
    return { ok: true, reason: "Remote/worldwide, no single country pay scale applies" };
  }

  return {
    ok: false,
    reason: `Location '${location}' does not match an eligible country and isn't remote/worldwide`,
  };
}

export function filterJobs(jobs) {
  const passed = [];
  for (const job of jobs) {
    const { ok, reason } = isLocationEligible(job.location || "");
    if (ok) {
      passed.push({ ...job, eligibilityReason: reason });
    }
  }
  return passed;
}

export async function deduplicateAgainstSheet(jobs, sheetsClient) {
  const newJobs = [];
  for (const job of jobs) {
    const exists = await sheetsClient.jobAlreadyExists(job.link || "");
    if (!exists) newJobs.push(job);
  }
  return newJobs;
}
