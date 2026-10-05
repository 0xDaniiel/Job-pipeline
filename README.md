# Job Pipeline

A real web app: finds remote (and eligible-country) developer jobs, filters
them by country/salary, scores them against your 3 resumes, shows everything
on a dashboard you open in a browser, auto-applies where it safely can, and
emails you a daily digest. Built for Daniel Chimezie, runs on a RackNerd VPS
via Node.js (no Python needed).

---

## How it all fits together

```
cron (7am daily)
      |
      v
  curl -> POST /api/run   <-- the one endpoint that runs the whole pipeline
      |
      |--> lib/fetchers/        pulls raw job listings from every source
      |--> lib/filters.js       drops jobs outside your country/salary list,
      |                         drops jobs already in the sheet
      |--> lib/scorer.js        picks the right resume, scores the match
      |--> lib/sheets.js        writes new matches to your Google Sheet
      |--> lib/autoApply.js     emails your resume for the few jobs that
      |                         accept applications by email
      |--> lib/mailer.js        sends you one daily summary email
      |
      v
  Your Google Sheet (source of truth) + the dashboard (what you look at)
      ^
      |
  app/page.js  <-- the dashboard you open in a browser, reads/writes the
                    sheet through app/api/jobs and app/api/approve
```

**Your role in the loop:** every morning you get an email, and you can also
just open the dashboard any time. New matches show up as "Awaiting Your
Approval." Click **Approve** on the dashboard (or edit the sheet directly,
both work) for anything you want applied to. The next day's run either
auto-applies it (rare, email-only jobs) or marks it "Needs Manual Apply"
with the link right there on the dashboard.

---

## What's in this folder

### Root files

| File | What it does |
|---|---|
| `README.md` | This file. |
| `package.json` | Dependencies: next, react, googleapis (Sheets), nodemailer (email), rss-parser (We Work Remotely feed). |
| `.env.local.example` | Template for every secret and setting. Copy to `.env.local` and fill in real values. **Never commit `.env.local`.** |
| `next.config.js` | Minimal Next.js config. |
| `.gitignore` | Keeps node_modules, build output, and secrets out of git. |

### `config/` — things you'll edit over time, no code changes needed

| File | What it does |
|---|---|
| `countries.json` | The ~29 countries where mid-level dev pay clears your $28K/year ($2,333/month) floor, researched during planning. Documents excluded countries with reasons (Russia, India, Nigeria, Philippines). Edit `eligible_countries` any time. |
| `companies.json` | Starter company slugs checked on Greenhouse, Lever, Ashby, BambooHR. Small on purpose, add more any time. |
| `cvMapping.json` | Keyword rules deciding which of your 3 resumes fits a job. Edit the keyword lists to improve matching as you see real results. |

### `resumes/` — your 3 tailored CVs

The actual PDFs the app attaches when auto-applying. If you update a resume
later, replace the file using the exact same filename referenced in
`cvMapping.json` and `app/api/run/route.js`'s `RESUME_FILENAME_BY_LABEL`.

### `app/` — the web app itself

| File | What it does |
|---|---|
| `layout.js` | Root layout, loads the Fraunces + Inter fonts. |
| `globals.css` | All styling and design tokens (colors, type, spacing) in one place. |
| `page.js` | **The dashboard.** Fetches jobs from `/api/jobs`, shows stat counts, status tabs, and Approve/Dismiss buttons that call `/api/approve`. |
| `api/run/route.js` | **The orchestrator.** This is the one endpoint cron calls daily. Fetch, filter, score, write to sheet, process approvals, send digest, in that order. |
| `api/jobs/route.js` | Returns every row from the sheet as JSON, for the dashboard. |
| `api/approve/route.js` | Updates a row's status when you click a dashboard button. |

### `lib/` — the actual logic

| File | What it does |
|---|---|
| `sheets.js` | All reads/writes to your Google Sheet via the `googleapis` package. Adding jobs, checking status, updating status, follow-up dates, duplicate detection. |
| `filters.js` | Country/salary eligibility check (reads `config/countries.json`) and the dedup check against your sheet. |
| `scorer.js` | Picks which resume fits a job and computes a 0-100 match score. Jobs below your minimum score (set in `.env.local`) never reach the sheet. |
| `mailer.js` | Builds and sends the daily digest email and follow-up reminders, via `nodemailer`. |
| `autoApply.js` | The one submission path that's actually automated: jobs whose application method is a plain email address. |
| `loadJson.js` | Small shared helper that loads the config JSON files safely (avoids a Node version quirk with native JSON import syntax, explained in code comments). |

### `lib/fetchers/` — one file per job source

| File | Source | Access type |
|---|---|---|
| `base.js` | Shared job format + fetch helper. Not a source itself. | — |
| `remotive.js` | Remotive | Public API |
| `weworkremotely.js` | We Work Remotely | Public RSS feeds |
| `himalayas.js` | Himalayas | Public API |
| `remoteok.js` | RemoteOK | Public API |
| `greenhouse.js` | Any company on Greenhouse (list in `companies.json`) | Public per-company JSON |
| `lever.js` | Any company on Lever | Public per-company JSON |
| `ashby.js` | Any company on Ashby | Public per-company JSON |
| `bamboohr.js` | Any company on BambooHR | Public per-company JSON |
| `seek.js` | SEEK (Australia/NZ) | Public search API |
| `index.js` | Runs every fetcher above and combines results. One source failing doesn't stop the others. |

**Not included, and why:** LinkedIn and Indeed both lack individual-developer
API access (LinkedIn's Jobs API needs a Talent Solutions partnership not
currently open to new applicants; Indeed's Publisher API was shut down in
2023). Scraping either risks account bans. LinkedIn is meant to be handled
by reading your job-alert emails instead, not built into this codebase yet
since that reads your personal inbox rather than a public source.

### `cron/`

| File | What it does |
|---|---|
| `daily-run.sh` | Calls the running app's `/api/run` endpoint with the secret header. This is what cron actually runs. |
| `setup_cron.sh` | One-time installer that adds `daily-run.sh` to your crontab, with a confirmation prompt first. |

### `logs/`

Empty folder where `daily-run.sh` appends each day's run output.

---

## Setup, step by step

### 1. Install Node.js on your VPS (if not already there)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
node --version   # should show v20.x or similar
```

### 2. Install dependencies

```bash
cd job-pipeline
npm install
```

### 3. Google Sheets setup (if you haven't done this part yet)

Same as before: create a Google Cloud project, enable the Sheets + Drive
APIs, create a service account, download its JSON key, create the sheet
with the right columns, share it with the service account's email, move the
key file onto this VPS outside any public web folder.

The sheet needs these exact column headers in row 1:
`Date Found, Company, Role Title, Employment Type, Country/Remote, Est. Salary, Match Score, CV Version Used, Link, Submission Method, Status, Follow-up Date, Notes`

(The app will also create this header automatically on first write if the
sheet is empty.)

### 4. Configure secrets

```bash
cp .env.local.example .env.local
nano .env.local
```

You'll need:
- The path to your Google service account JSON key
- Your sheet's **Spreadsheet ID** (the long string in its URL between `/d/` and `/edit`)
- A Gmail **App Password** (not your normal password): Google Account > Security > 2-Step Verification > App Passwords
- A random `CRON_SECRET` (generate one with `openssl rand -hex 24`)

### 5. Build and run

```bash
npm run build
npm run start
```

This starts the app on port 3000. Visit `http://your-vps-ip:3000` and you
should see the dashboard (empty until the first pipeline run).

### 6. Test the pipeline manually

```bash
curl -X POST http://localhost:3000/api/run -H "x-cron-secret: YOUR_CRON_SECRET"
```

Watch the response for the step-by-step log (jobs found, after filtering,
after scoring, etc). If something's zero when it shouldn't be, that tells
you where to look first.

### 7. Deploying for real (keeping it running + daily cron)

`npm run start` only runs while your terminal is open. For it to survive
reboots and stay up permanently, use PM2:

```bash
npm install -g pm2
pm2 start npm --name "job-pipeline" -- start
pm2 save
pm2 startup   # follow the printed instructions to enable on-boot start
```

Then install the daily cron job:

```bash
chmod +x cron/setup_cron.sh cron/daily-run.sh
./cron/setup_cron.sh
```

Runs every day at 7:00 AM server time by default. Change it with `crontab -e`.

### 8. (Optional) Put it behind a real domain

If you want to open this from your phone/laptop by URL instead of
`http://ip:3000`, put Nginx in front of it as a reverse proxy and point a
domain/subdomain at it. This is also where you'd add basic auth or an IP
allowlist, since right now the dashboard has no login screen (it's assumed
to only be reachable by you).

---

## Known limitations (said plainly)

- **Country matching is substring-based**, not true geocoding. Handles
  common abbreviations (UK, US, UAE, Dubai) but can miss unusual phrasing.
  Check `lib/filters.js`'s `SYNONYMS` object if a posting isn't matching
  right, and extend it.
- **Match scoring is a lightweight approximation**, not the detailed manual
  JD review from earlier in planning. It's a first-pass filter, not a
  guarantee. Always read the real posting before applying.
- **Auto-apply only works for email-based applications** (a minority of
  real postings). Deliberate, not a missed feature: most ATS systems use
  web forms with custom questions that shouldn't be auto-filled blindly.
- **Salary data per job isn't pulled live.** Most sources don't expose this
  reliably, so the sheet shows "Not listed" unless a posting states it
  directly.
- **The dashboard has no login/auth.** Fine if only reachable via
  `localhost` or a firewalled VPS IP; add real auth before exposing it
  publicly.
- **LinkedIn isn't wired in yet.** Reads your personal inbox, intentionally
  kept as a separate future piece.

## Realistic next steps, in order

1. Confirm the Sheets connection and one full manual `/api/run` call work end to end.
2. Watch a few real daily runs, tune `MINIMUM_MATCH_SCORE` in `.env.local` if you see too many or too few jobs.
3. Expand `config/companies.json` with companies from your original 40-target-company list.
4. Add basic auth or an IP allowlist before exposing the dashboard beyond localhost.
5. Build the LinkedIn-alert-email reader as a script that also writes into the sheet via `lib/sheets.js`.
6. Revisit `config/countries.json` every few months, salary data isn't static and this list was manually researched.
