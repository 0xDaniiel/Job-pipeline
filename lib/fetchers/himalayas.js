// himalayas.js
// Public jobs API, no key required for basic listing. https://himalayas.app/jobs/api

import { safeGet, makeJob } from "./base.js";

const API_URL = "https://himalayas.app/jobs/api";

export async function fetchHimalayas(limit = 100) {
  const jobs = [];
  const res = await safeGet(API_URL, { limit });
  if (!res) return jobs;

  const data = await res.json();
  for (const item of data.jobs || []) {
    const locations = item.locationRestrictions || [];
    jobs.push(makeJob({
      title: item.title || "",
      company: item.companyName || "",
      location: locations.length ? locations.join(", ") : "Worldwide",
      employmentType: item.employmentType || "",
      link: item.applicationLink || item.guid || "",
      description: item.description || "",
      source: "himalayas",
    }));
  }
  return jobs;
}
