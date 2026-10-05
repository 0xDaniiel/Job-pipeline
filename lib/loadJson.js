// loadJson.js
// Loads a JSON file relative to the CALLING module's directory, using
// plain fs.readFileSync instead of ESM JSON import assertions. The
// import-assertion syntax ("assert"/"with") differs between Node versions
// and bundlers, so this avoids that fragility entirely -- it works
// identically whether run through Next.js's build or plain `node file.js`.
//
// Usage: const data = loadJson(import.meta.url, "../../config/companies.json");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function loadJson(callerUrl, relativePath) {
  const callerDir = path.dirname(fileURLToPath(callerUrl));
  const fullPath = path.join(callerDir, relativePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw);
}
