// remotive.js
// Remotive public API, no key required. https://remotive.com/api/remote-jobs

import { safeGet, makeJob } from "./base.js";

const API_URL = "https://remotive.com/api/remote-jobs";

export async function fetchRemotive(searchTerms = ["react", "react native", "frontend", "full stack"]) {
  const jobs = [];
  const seen = new Set();

  for (const term of searchTerms) {
    const res = await safeGet(API_URL, { search: term, category: "software-dev" });
    if (!res) continue;
    const data = await res.json();
    for (const item of data.jobs || []) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      jobs.push(makeJob({
        title: item.title || "",
        company: item.company_name || "",
        location: item.candidate_required_location || "Worldwide",
        employmentType: item.job_type || "",
        link: item.url || "",
        description: item.description || "",
        source: "remotive",
      }));
    }
  }
  return jobs;
}
