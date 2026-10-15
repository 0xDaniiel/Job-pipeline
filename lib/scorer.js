// scorer.js
// Decides which of the 3 resumes fits a job, and computes a 0-100 match
// score so low-fit jobs are filtered before reaching the sheet or inbox.
// This is a lightweight approximation, not a human read of the posting.
// Always read the real posting before applying.

import { loadJson } from "./loadJson.js";

const cvMapping = loadJson(import.meta.url, "../config/cvMapping.json");

const CV_CATEGORIES = Object.fromEntries(
  Object.entries(cvMapping).filter(
    ([k]) => !k.startsWith("_") && k !== "notes",
  ),
);

const DEFAULT_CV_KEY =
  Object.entries(CV_CATEGORIES).find(([, v]) => v.isDefault)?.[0] ||
  Object.keys(CV_CATEGORIES)[0];

// Seniority is judged from the TITLE only. Descriptions are full of words
// like "lead" and "senior" ("lead generation", "senior leadership") that
// say nothing about the level of the role itself.
const SENIOR_SOFT = ["senior", "sr"]; // reachable with 5+ years, small penalty
const SENIOR_HARD = [
  "staff",
  "principal",
  "lead",
  "director",
  "head of",
  "vp",
  "manager",
  "architect",
];
const JUNIOR_WORDS = [
  "junior",
  "jr",
  "intern",
  "internship",
  "entry level",
  "entry-level",
  "graduate",
  "trainee",
];

// A role must look like a dev role by title.
const ROLE_WORDS = [
  "engineer",
  "developer",
  "programmer",
  "software",
  "frontend",
  "front-end",
  "front end",
  "full stack",
  "full-stack",
  "fullstack",
  "web",
  "mobile",
  "react",
  "ios",
  "android",
];

// At least one of these must appear somewhere, or the job isn't a fit.
const CORE_SKILLS = [
  "react",
  "reactjs",
  "react native",
  "next.js",
  "nextjs",
  "typescript",
  "javascript",
  "expo",
  "tailwind",
  "node.js",
  "nodejs",
];

const KNOWN_SKILLS = [
  ...CORE_SKILLS,
  "express.js",
  "mongodb",
  "postgresql",
  "postgres",
  "supabase",
  "socket.io",
  "zustand",
  "rest api",
  "solidity",
  "web3",
  "jest",
  "cypress",
  "git",
  "ci/cd",
  "i18n",
  "internationalization",
  "golang",
  "agile",
  "scrum",
];

// Whole-word matching: "expo" must NOT match "exposure", "go" must not
// match "google". Boundaries are any non-alphanumeric character.
const regexCache = new Map();
function hasTerm(text, term) {
  let re = regexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
    regexCache.set(term, re);
  }
  return re.test(text);
}

function textBlob(job) {
  return `${job.title || ""} ${job.description || ""}`.toLowerCase();
}

export function pickCvVersion(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();

  // Pass 1: title keywords
  let pass1Key = null;
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    if ((rules.titleKeywords || []).some((kw) => hasTerm(title, kw))) {
      pass1Key = key;
      break;
    }
  }

  // Pass 2: skill keyword overlap. Ties go to the default CV.
  const scores = {};
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    scores[key] = (rules.skillKeywords || []).filter((kw) =>
      hasTerm(blob, kw),
    ).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  let pass2Key = null;
  if (maxScore > 0) {
    const top = Object.keys(scores).filter((k) => scores[k] === maxScore);
    pass2Key = top.includes(DEFAULT_CV_KEY) ? DEFAULT_CV_KEY : top[0];
  }

  const finalKey = pass1Key || pass2Key || DEFAULT_CV_KEY;
  const needsReview = Boolean(pass1Key && pass2Key && pass1Key !== pass2Key);

  return {
    cvKey: finalKey,
    resumeFile: CV_CATEGORIES[finalKey].resumeFile,
    needsReview,
  };
}

export function computeMatchScore(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();
  let score = 15; // base

  // Skills overlap (up to 40)
  const skillHits = KNOWN_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  score += Math.min(skillHits * 6, 40);

  // Seniority, from the title only
  if (SENIOR_HARD.some((w) => hasTerm(title, w))) {
    score -= 25;
  } else if (SENIOR_SOFT.some((w) => hasTerm(title, w))) {
    score += 15; // senior is reachable, slightly below a mid-level fit
  } else if (JUNIOR_WORDS.some((w) => hasTerm(title, w))) {
    score -= 10;
  } else {
    score += 25;
  }

  // Description asks for 7+ years: probably too senior
  if (/\b(7|8|9|1\d)\s*\+?\s*(years|yrs)\b/.test(blob)) score -= 10;

  if ((job.description || "").length > 200) score += 10;
  if (job.employmentType) score += 10;

  // Relevance gates: non-dev titles and jobs with no core web/mobile skill
  // can't pass on bonuses alone.
  if (!ROLE_WORDS.some((w) => hasTerm(title, w))) score -= 40;
  const coreHits = CORE_SKILLS.filter((kw) => hasTerm(blob, kw)).length;
  if (coreHits === 0) score = Math.min(score, 45);

  return Math.max(0, Math.min(100, score));
}

export function scoreAndTag(job) {
  const { cvKey, resumeFile, needsReview } = pickCvVersion(job);
  return {
    ...job,
    cvVersion: cvKey,
    resumeFile,
    matchScore: computeMatchScore(job),
    needsManualReview: needsReview,
  };
}

export function scoreAll(jobs, minimumScore = 55) {
  return jobs.map(scoreAndTag).filter((j) => j.matchScore >= minimumScore);
}
