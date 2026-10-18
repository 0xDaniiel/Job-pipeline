// linkedin.js
// Builds LinkedIn search links for a company. These are plain search URLs
// you open yourself in the browser, nothing is scraped or automated.

export function linkedinLinks(company) {
  const name = (company || "").trim();
  const search = (type, keywords) =>
    `https://www.linkedin.com/search/results/${type}/?keywords=${encodeURIComponent(keywords)}`;
  return {
    company: search("companies", name),
    recruiters: search("people", `${name} recruiter`),
    engineers: search("people", `${name} software engineer`),
  };
}
