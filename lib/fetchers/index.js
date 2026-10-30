// index.js
// Runs every source fetcher. Each source is isolated: if one fails (API down,
// format changed), the others still run. Failures are logged, not thrown, so a
// daily run never dies partway through because of one broken source.
//
// keep (optional) decides whether a job is worth holding on to. It runs on
// each source's jobs the moment they arrive, so thousands of jobs that could
// never pass never pile up in memory.
//
// Returns { jobs, total }: the jobs kept, and how many were seen in all.

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

export async function fetchAllJobs(keep = () => true) {
  const jobs = [];
  let total = 0;

  for (const [name, fetchFn] of Object.entries(ALL_FETCHERS)) {
    try {
      const found = await fetchFn();
      total += found.length;

      let kept = 0;
      for (const job of found) {
        try {
          if (keep(job)) {
            jobs.push(job);
            kept++;
          }
        } catch (err) {
          // one odd job must not discard the rest of this source
        }
      }
      console.log(`[fetchers] ${name}: ${found.length} jobs, kept ${kept}`);
    } catch (err) {
      console.warn(`[fetchers] ${name} FAILED: ${err.message}`);
    }
  }

  return { jobs, total };
}
