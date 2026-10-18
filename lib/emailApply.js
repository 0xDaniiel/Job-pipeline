// emailApply.js
// Finds an application email address inside a job description, for jobs
// that say "send your CV to jobs@company.com". Conservative on purpose:
// the address must sit next to apply/CV/resume wording, and generic
// addresses (support@, privacy@, info@ ...) are ignored.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

const IGNORE =
  /(^(no-?reply|do-?not-?reply|privacy|legal|press|media|support|billing|abuse|security|dpo|gdpr|compliance|info|hello|sales|help|contact|ethics|diversity|inclusion|eeo|ada|hr-?help|employee|investor|ir)@)|accommodat|accessib|disabilit/i;
const APPLY_HINT =
  /\b(apply|application|applications|resume|résumé|cv|send|submit|forward|email us|e-mail us|reach out|interested)\b/i;

function toText(html) {
  return (html || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

export function findApplyEmail(description) {
  const text = toText(description);
  for (const match of text.matchAll(EMAIL_RE)) {
    const email = match[0].replace(/[.]+$/, "");
    if (IGNORE.test(email)) continue;
    const start = match.index;
    const around = text.slice(
      Math.max(0, start - 150),
      start + email.length + 60,
    );
    if (APPLY_HINT.test(around)) return email.toLowerCase();
  }
  return null;
}
