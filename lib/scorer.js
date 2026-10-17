// scorer.js
// Decides which of the 3 resumes fits a job and computes a 0-100 match score.
// A lightweight first-pass filter, not a human read of the posting.
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

// Seniority is judged from the TITLE only.
const SENIOR_SOFT = ["senior", "sr"];
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

// Titles that say "engineer" but are not developer jobs.
const NON_DEV_TITLE = [
  "support",
  "sales",
  "customer",
  "success",
  "account",
  "recruiter",
  "talent",
  "marketing",
  "designer",
  "attorney",
  "counsel",
  "legal",
  "finance",
  "accountant",
  "analyst",
  "operations",
  "people",
  "writer",
  "content",
  "community",
  "solutions",
  "researcher",
  "scientist",
  "technician",
  "developer relations",
  "advocate",
  "evangelist",
  "consultant",
  "administrator",
  "specialist",
  "coordinator",
  "associate",
  "representative",
  "trainer",
];

// Stacks and specialities that are not a fit for the CVs.
const WRONG_STACK_TITLE = [
  "game",
  ".net",
  "dotnet",
  "c#",
  "c++",
  "angular",
  "vue",
  "vue.js",
  "php",
  "ruby",
  "rails",
  "python",
  "django",
  "java",
  "salesforce",
  "shopify",
  "wordpress",
  "sap",
  "servicenow",
  "devops",
  "sre",
  "reliability",
  "security",
  "machine learning",
  "ml",
  "data",
  "embedded",
  "firmware",
  "qa",
  "test",
  "sdet",
  "database",
  "dba",
  "network",
  "kubernetes",
  "infrastructure",
  "cloud",
  "deployment",
  "postgres",
  "blockchain",
  "platform",
];

// Backend-only roles: you are frontend-focused, so these score low even when
// the description mentions React or Node.js.
const BACKEND_TITLE = [
  "backend",
  "back-end",
  "back end",
  "server-side",
  "server side",
  "api engineer",
];
// A title with one of these alongside "backend" is a full-stack or
// frontend role, so it is not penalised ("Full Stack (Backend heavy)").
const FRONT_OR_FULL_TITLE = [
  "frontend",
  "front-end",
  "front end",
  "full stack",
  "full-stack",
  "fullstack",
  "react",
  "ui",
  "web",
  "mobile",
  "product engineer",
];
// A title containing one of these is a fit for the CVs, so a wrong-stack
// word next to it ("React + .NET") is not penalised.
const FIT_STACK_TITLE = [
  "react",
  "react native",
  "typescript",
  "javascript",
  "node",
  "node.js",
  "next.js",
  "nextjs",
  "expo",
  "frontend",
  "front-end",
  "front end",
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

// Whole-word matching: "expo" must not match "exposure".
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

  let pass1Key = null;
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    if ((rules.titleKeywords || []).some((kw) => hasTerm(title, kw))) {
      pass1Key = key;
      break;
    }
  }

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
    score += 15;
  } else if (JUNIOR_WORDS.some((w) => hasTerm(title, w))) {
    score -= 10;
  } else {
    score += 25;
  }

  // Asks for 7+ years: probably too senior
  if (/\b(7|8|9|1\d)\s*\+?\s*(years|yrs)\b/.test(blob)) score -= 10;

  if ((job.description || "").length > 200) score += 10;
  if (job.employmentType) score += 10;

  // Title relevance
  const titleFitsStack = FIT_STACK_TITLE.some((w) => hasTerm(title, w));
  if (titleFitsStack) score += 10;
  if (!ROLE_WORDS.some((w) => hasTerm(title, w))) score -= 40;
  if (NON_DEV_TITLE.some((w) => hasTerm(title, w))) score -= 60;
  if (!titleFitsStack && WRONG_STACK_TITLE.some((w) => hasTerm(title, w))) {
    score -= 40;
  }
  if (
    BACKEND_TITLE.some((w) => hasTerm(title, w)) &&
    !FRONT_OR_FULL_TITLE.some((w) => hasTerm(title, w))
  ) {
    score -= 50;
  }
  // No core web/mobile skill anywhere: can't pass on bonuses alone
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

// Scores every job, keeps those at or above minimumScore, best first, and
// allows at most maxPerCompany per company so one employer can't fill the
// whole list. Jobs left out come back in later runs, since only jobs
// already in the sheet are skipped.
export function scoreAll(jobs, minimumScore = 55, maxPerCompany = 3) {
  const scored = jobs
    .map(scoreAndTag)
    .filter((j) => j.matchScore >= minimumScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  const perCompany = new Map();
  return scored.filter((j) => {
    const key = (j.company || "unknown").toLowerCase();
    const count = perCompany.get(key) || 0;
    if (count >= maxPerCompany) return false;
    perCompany.set(key, count + 1);
    return true;
  });
}
