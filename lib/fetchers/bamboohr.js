// bamboohr.js
// Public careers JSON endpoint, no auth. Reads company subdomains from config/companies.json.

import { safeGet, makeJob } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://${slug}.bamboohr.com/careers/list`;

export async function fetchBambooHR() {
  const jobs = [];
  for (const slug of companies.bamboohr || []) {
    const res = await safeGet(API_TEMPLATE(slug));
    if (!res) continue;
    const data = await res.json();
    for (const item of data.result || []) {
      jobs.push(makeJob({
        title: item.jobOpeningName || "",
        company: slug,
        location: item.location?.city || "",
        employmentType: item.employmentStatusLabel || "",
        link: `https://${slug}.bamboohr.com/careers/${item.id || ""}`,
        description: "",
        source: "bamboohr",
      }));
    }
  }
  return jobs;
}
