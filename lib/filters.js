// filters.js
// Keeps jobs in eligible countries (config/countries.json), and removes jobs
// already in the Google Sheet. Location never blocks or penalises a job
// beyond the country list: it only adds a flag you can read in the Notes.

import { loadJson } from "./loadJson.js";

const countriesConfig = loadJson(import.meta.url, "../config/countries.json");

const ELIGIBLE_COUNTRIES = new Set(
  (countriesConfig.eligible_countries || []).map((c) => c.toLowerCase()),
);

const REMOTE_SIGNALS = [
  "remote",
  "worldwide",
  "anywhere",
  "global",
  "distributed",
];

// Phrases in a description that make clear the job is remote.
const REMOTE_TEXT =
  /\b(fully remote|100% remote|remote[- ]first|remote[- ]friendly|work from anywhere|work remotely|remote position|remote role|this is a remote)\b/i;

// These boards only list remote jobs, so every job from them is remote even
// when its location text is just a country name.
const REMOTE_ONLY_SOURCES = [
  "remotive",
  "weworkremotely",
  "himalayas",
  "remoteok",
];

// Set REQUIRE_REMOTE=true in .env.local to drop jobs that don't look remote
// (on-site office jobs from company career pages). Off by default.
const REQUIRE_REMOTE = process.env.REQUIRE_REMOTE === "true";

// Abbreviations real postings use, mapped to the names in countries.json.
const SYNONYMS = {
  uk: "united kingdom",
  "u.k.": "united kingdom",
  britain: "united kingdom",
  us: "united states",
  "u.s.": "united states",
  usa: "united states",
  "u.s.a.": "united states",
  uae: "united arab emirates",
  "u.a.e.": "united arab emirates",
  dubai: "united arab emirates",
  "abu dhabi": "united arab emirates",
  holland: "netherlands",
  korea: "south korea",
};

function extractNamedCountry(location) {
  const loc = location.toLowerCase();
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    const re = new RegExp(`(^|[^a-z])${alias.replace(/\./g, "\\.")}($|[^a-z])`);
    if (re.test(loc) && ELIGIBLE_COUNTRIES.has(canonical)) return canonical;
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
    return {
      ok: true,
      reason: "No location specified, treated as open/remote",
    };
  }
  const namedCountry = extractNamedCountry(location);
  if (namedCountry) {
    return {
      ok: true,
      reason: `Named country '${namedCountry}' is on the eligible list`,
    };
  }
  if (looksRemoteWorldwide(location)) {
    return {
      ok: true,
      reason: "Remote/worldwide, no single country pay scale applies",
    };
  }
  return {
    ok: false,
    reason: `Location '${location}' does not match an eligible country and isn't remote/worldwide`,
  };
}

// True if the job is clearly remote: it came from a remote-only board, the
// location or title says so, or the description says so.
export function isRemoteJob(job) {
  if (REMOTE_ONLY_SOURCES.includes(job.source)) return true;
  const loc = (job.location || "").toLowerCase();
  const title = (job.title || "").toLowerCase();
  if (REMOTE_SIGNALS.some((s) => loc.includes(s) || title.includes(s)))
    return true;
  return REMOTE_TEXT.test((job.description || "").slice(0, 4000));
}

// Locations that mean "open to people in Africa / anywhere".
const OPEN_SIGNALS = ["worldwide", "global", "anywhere", "emea", "africa"];
// Regions that exclude Nigeria.
const CLOSED_REGIONS = [
  "amer",
  "americas",
  "north america",
  "latam",
  "latin america",
  "apac",
  "asia",
];

// True when a job is tied to specific countries or regions (e.g. "Remote -
// USA", "Remote, AMER"). Only used as a note, it never blocks or penalises.
export function isLocationRestricted(location) {
  const loc = (location || "").toLowerCase();
  if (!loc || OPEN_SIGNALS.some((s) => loc.includes(s))) return false;
  if (extractNamedCountry(loc)) return true;
  return CLOSED_REGIONS.some((r) =>
    new RegExp(`(^|[^a-z])${r}($|[^a-z])`).test(loc),
  );
}

export function filterJobs(jobs) {
  const passed = [];
  for (const job of jobs) {
    if (REQUIRE_REMOTE && !isRemoteJob(job)) continue;
    const { ok, reason } = isLocationEligible(job.location || "");
    if (ok) {
      passed.push({
        ...job,
        eligibilityReason: reason,
        locationRestricted: isLocationRestricted(job.location || ""),
      });
    }
  }
  return passed;
}

// Removes jobs with no link, jobs already in the sheet, and duplicates
// within this batch. existingLinks is a Set from getExistingLinks().
export function deduplicate(jobs, existingLinks) {
  const seen = new Set(existingLinks);
  return jobs.filter((j) => {
    if (!j.link || seen.has(j.link)) return false;
    seen.add(j.link);
    return true;
  });
}
