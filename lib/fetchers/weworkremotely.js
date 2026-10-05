// weworkremotely.js
// Public RSS feeds, no auth. Category feeds relevant to your target roles.

import Parser from "rss-parser";
import { makeJob } from "./base.js";

const parser = new Parser();

const FEEDS = {
  programming: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  fullStack: "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  frontEnd: "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
};

export async function fetchWeWorkRemotely() {
  const jobs = [];

  for (const [category, url] of Object.entries(FEEDS)) {
    try {
      const feed = await parser.parseURL(url);
      for (const entry of feed.items || []) {
        const titleRaw = entry.title || "";
        let company = "";
        let title = titleRaw;
        if (titleRaw.includes(":")) {
          [company, title] = titleRaw.split(":", 2).map((s) => s.trim());
        }
        jobs.push(makeJob({
          title,
          company,
          location: "Remote",
          employmentType: "",
          link: entry.link || "",
          description: entry.contentSnippet || entry.content || "",
          source: "weworkremotely",
        }));
      }
    } catch (err) {
      console.warn(`[weworkremotely] feed ${category} failed: ${err.message}`);
    }
  }
  return jobs;
}
