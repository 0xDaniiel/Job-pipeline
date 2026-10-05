// ashby.js
// Public job-board API, no auth. Reads company slugs from config/companies.json.

import { safeGet, makeJob } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

export async function fetchAshby() {
  const jobs = [];
  for (const slug of companies.ashby || []) {
    const res = await safeGet(API_TEMPLATE(slug));
    if (!res) continue;
    const data = await res.json();
    for (const item of data.jobs || []) {
      jobs.push(makeJob({
        title: item.title || "",
        company: slug,
        location: item.location || "",
        employmentType: item.employmentType || "",
        link: item.jobUrl || item.applyUrl || "",
        description: item.descriptionPlain || "",
        source: "ashby",
      }));
    }
  }
  return jobs;
}
