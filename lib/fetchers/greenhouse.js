// greenhouse.js
// Public per-company JSON endpoint, no auth. Reads company slugs from config/companies.json.

import { safeGet, makeJob } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;

export async function fetchGreenhouse() {
  const jobs = [];
  for (const slug of companies.greenhouse || []) {
    const res = await safeGet(API_TEMPLATE(slug), { content: "true" });
    if (!res) continue;
    const data = await res.json();
    for (const item of data.jobs || []) {
      jobs.push(makeJob({
        title: item.title || "",
        company: slug,
        location: item.location?.name || "",
        employmentType: "",
        link: item.absolute_url || "",
        description: item.content || "",
        source: "greenhouse",
      }));
    }
  }
  return jobs;
}
