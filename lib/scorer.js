// scorer.js
// Decides which of the 3 resumes fits a job, and computes a 0-100 match
// score so low-fit jobs can be filtered before reaching the sheet or inbox.
// This is a lightweight approximation, not the detailed manual JD review
// done earlier in planning. Always read the real posting before applying.

import { loadJson } from "./loadJson.js";

const cvMapping = loadJson(import.meta.url, "../config/cvMapping.json");

const CV_CATEGORIES = Object.fromEntries(
  Object.entries(cvMapping).filter(([k]) => !k.startsWith("_") && k !== "notes")
);

const DEFAULT_CV_KEY =
  Object.entries(CV_CATEGORIES).find(([, v]) => v.isDefault)?.[0] ||
  Object.keys(CV_CATEGORIES)[0];

const SENIOR_DISQUALIFIERS = ["senior", "staff", "principal", "lead", "director", "head of", "vp "];
const JUNIOR_SIGNALS = ["junior", "intern", "entry level", "entry-level", "graduate"];

const KNOWN_SKILLS = [
  "react", "typescript", "javascript", "next.js", "nextjs", "react native",
  "expo", "tailwind", "node.js", "nodejs", "express", "mongodb", "postgresql",
  "supabase", "socket.io", "zustand", "rest api", "solidity", "web3",
  "jest", "cypress", "testing", "git", "ci/cd", "i18n", "internationalization",
  "go", "golang", "agile", "scrum",
];

function textBlob(job) {
  return `${job.title || ""} ${job.description || ""}`.toLowerCase();
}

export function pickCvVersion(job) {
  const blob = textBlob(job);
  const title = (job.title || "").toLowerCase();

  let pass1Key = null;
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    if ((rules.titleKeywords || []).some((kw) => title.includes(kw))) {
      pass1Key = key;
      break;
    }
  }

  const scores = {};
  for (const [key, rules] of Object.entries(CV_CATEGORIES)) {
    scores[key] = (rules.skillKeywords || []).filter((kw) => blob.includes(kw)).length;
  }
  const maxScore = Math.max(...Object.values(scores));
  const pass2Key = maxScore > 0 ? Object.keys(scores).find((k) => scores[k] === maxScore) : null;

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
  let score = 15; // base score, every real posting starts here

  const skillHits = KNOWN_SKILLS.filter((kw) => blob.includes(kw)).length;
  score += Math.min(skillHits * 6, 40);

  if (SENIOR_DISQUALIFIERS.some((w) => blob.includes(w))) {
    score -= 20;
  } else if (JUNIOR_SIGNALS.some((w) => blob.includes(w))) {
    score -= 10;
  } else {
    score += 25; // no senior/junior signal, assume mid-level, matches target
  }

  if ((job.description || "").length > 200) score += 10;
  if (job.employmentType) score += 10;

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
