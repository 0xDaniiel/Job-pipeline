// index.js
// Runs every source fetcher and returns one combined list. Each fetcher is
// isolated: if one source fails (API down, format changed), the others
// still run. Failures are logged, not thrown, so a daily run never dies
// partway through because of one broken source.

import { fetchRemotive } from "./remotive.js";
import { fetchWeWorkRemotely } from "./weworkremotely.js";
import { fetchHimalayas } from "./himalayas.js";
import { fetchRemoteOK } from "./remoteok.js";
import { fetchGreenhouse } from "./greenhouse.js";
import { fetchLever } from "./lever.js";
import { fetchAshby } from "./ashby.js";
import { fetchBambooHR } from "./bamboohr.js";
import { fetchSeek } from "./seek.js";

const ALL_FETCHERS = {
  remotive: fetchRemotive,
  weworkremotely: fetchWeWorkRemotely,
  himalayas: fetchHimalayas,
  remoteok: fetchRemoteOK,
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  bamboohr: fetchBambooHR,
  seek: fetchSeek,
};

export async function fetchAllJobs() {
  let allJobs = [];
  for (const [name, fetchFn] of Object.entries(ALL_FETCHERS)) {
    try {
      const jobs = await fetchFn();
      console.log(`[fetchers] ${name}: ${jobs.length} jobs`);
      allJobs = allJobs.concat(jobs);
    } catch (err) {
      console.warn(`[fetchers] ${name} FAILED: ${err.message}`);
    }
  }
  return allJobs;
}
