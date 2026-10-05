// lever.js
// Public per-company JSON endpoint, no auth. Reads company slugs from config/companies.json.

import { safeGet, makeJob } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://api.lever.co/v0/postings/${slug}`;

export async function fetchLever() {
  const jobs = [];
  for (const slug of companies.lever || []) {
    const res = await safeGet(API_TEMPLATE(slug), { mode: "json" });
    if (!res) continue;
    const data = await res.json();
    for (const item of data) {
      const categories = item.categories || {};
      jobs.push(makeJob({
        title: item.text || "",
        company: slug,
        location: categories.location || "",
        employmentType: categories.commitment || "",
        link: item.hostedUrl || "",
        description: item.descriptionPlain || item.description || "",
        source: "lever",
      }));
    }
  }
  return jobs;
}
