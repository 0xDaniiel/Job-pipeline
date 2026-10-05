// remoteok.js
// Public API, no key required. https://remoteok.com/api
// Keep request frequency reasonable (a few times a day) per their ask.

import { safeGet, makeJob } from "./base.js";

const API_URL = "https://remoteok.com/api";

export async function fetchRemoteOK() {
  const jobs = [];
  const res = await safeGet(API_URL);
  if (!res) return jobs;

  const data = await res.json();
  // First item is a legal/metadata notice, not a job. Skip it.
  for (const item of data.slice(1)) {
    if (!item || !item.position) continue;
    jobs.push(makeJob({
      title: item.position || "",
      company: item.company || "",
      location: item.location || "Worldwide",
      employmentType: "",
      link: item.url || "",
      description: item.description || "",
      source: "remoteok",
    }));
  }
  return jobs;
}
