// seek.js
// SEEK's public, unauthenticated search API (same one the site's own frontend calls).
// Covers Australia and New Zealand, both on the eligible country list.

import { safeGet, makeJob } from "./base.js";

const API_URL = "https://www.seek.com.au/api/jobsearch/v5/search";

export async function fetchSeek(keywords = "react developer") {
  const jobs = [];
  const res = await safeGet(API_URL, {
    keywords,
    page: 1,
    classification: "6281", // Information & Communication Technology
  });
  if (!res) return jobs;

  const data = await res.json();
  for (const item of data.data || []) {
    jobs.push(makeJob({
      title: item.title || "",
      company: item.advertiser?.description || "",
      location: item.locations?.[0]?.label || "Australia",
      employmentType: item.workTypes?.[0] || "",
      link: `https://www.seek.com.au/job/${item.id || ""}`,
      description: item.teaser || "",
      source: "seek",
    }));
  }
  return jobs;
}
