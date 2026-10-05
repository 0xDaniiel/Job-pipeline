// base.js
// Shared job shape and a safe fetch wrapper every source fetcher uses.

export function makeJob(fields) {
  return {
    title: "",
    company: "",
    location: "",
    employmentType: "",
    link: "",
    description: "",
    source: "",
    ...fields,
  };
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; job-pipeline-bot/1.0; personal use)",
};

export async function safeGet(url, params = {}) {
  try {
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;
    const res = await fetch(fullUrl, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`[fetchers] ${url} returned status ${res.status}`);
      return null;
    }
    return res;
  } catch (err) {
    console.warn(`[fetchers] request to ${url} failed: ${err.message}`);
    return null;
  }
}
