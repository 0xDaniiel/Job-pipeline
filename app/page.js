"use client";

import { useEffect, useState, useMemo } from "react";
import { linkedinLinks } from "../lib/linkedin.js";

const STATUS_COLOR = {
  "Awaiting Your Approval": "var(--status-awaiting)",
  Approved: "var(--status-approved)",
  Applied: "var(--status-applied)",
  "Applied (Auto)": "var(--status-applied)",
  "Needs Manual Apply": "var(--status-manual)",
  Interview: "var(--status-interview)",
  Rejected: "var(--status-rejected)",
  "No Response": "var(--status-none)",
  "Follow-up Sent": "var(--status-approved)",
};

const CV_LABEL = {
  frontend_engineer: "Frontend CV",
  react_native: "React Native CV",
  product_engineer: "Product CV",
};

const TABS = [
  { key: "all", label: "All", match: () => true },
  {
    key: "awaiting",
    label: "Awaiting approval",
    match: (s) => s === "Awaiting Your Approval",
  },
  {
    key: "manual",
    label: "Needs manual apply",
    match: (s) => s === "Needs Manual Apply",
  },
  { key: "applied", label: "Applied", match: (s) => s.startsWith("Applied") },
  { key: "interview", label: "Interview", match: (s) => s === "Interview" },
  { key: "rejected", label: "Rejected", match: (s) => s === "Rejected" },
];

const KIT_STATUSES = [
  "Awaiting Your Approval",
  "Needs Manual Apply",
  "Approved",
];
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// The address an email-apply job will be sent to, or null for web-form jobs.
function applyEmailOf(job) {
  const method = (job["Submission Method"] || "").trim().toLowerCase();
  if (method !== "email") return null;
  const match = (job.Notes || "").match(EMAIL_RE);
  return match ? match[0] : null;
}

function KitPanel({ job, kit, copied, onCopy }) {
  const cvKey = job["CV Version Used"] || "frontend_engineer";
  const summary = kit.summaries ? kit.summaries[cvKey] : null;
  const summaryKey = `${job._row}-summary`;

  return (
    <div className="kitPanel">
      <div className="kitTitle">Your details</div>
      <div className="kitChips">
        {kit.profile.map((f) => {
          const key = `${job._row}-p-${f.label}`;
          return (
            <button
              key={key}
              className="chip"
              onClick={() => onCopy(f.value, key)}
            >
              {copied === key ? "Copied" : `Copy ${f.label}`}
            </button>
          );
        })}
      </div>

      <div className="kitTitle">Saved answers</div>
      {kit.answers.map((a) => {
        const key = `${job._row}-a-${a.label}`;
        const needsEdit = a.value.startsWith("EDIT ME");
        return (
          <div className="answerRow" key={key}>
            <div className={needsEdit ? "answerText needsEdit" : "answerText"}>
              <span className="answerLabel">{a.label}</span>
              <span>{a.value}</span>
            </div>
            <button className="actionBtn" onClick={() => onCopy(a.value, key)}>
              {copied === key ? "Copied" : "Copy"}
            </button>
          </div>
        );
      })}

      {summary && (
        <>
          <div className="kitTitle">
            Short summary ({CV_LABEL[cvKey] || "CV"})
          </div>
          <div className="answerRow">
            <div className="answerText">
              <span>{summary}</span>
            </div>
            <button
              className="actionBtn"
              onClick={() => onCopy(summary, summaryKey)}
            >
              {copied === summaryKey ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      <div className="kitLinks">
        <a className="actionBtn primary" href={`/api/resume?cv=${cvKey}`}>
          Download {CV_LABEL[cvKey] || "CV"}
        </a>
        <a
          className="actionBtn"
          href={job.Link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open application
        </a>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [busyRow, setBusyRow] = useState(null);
  const [kit, setKit] = useState(null);
  const [openKit, setOpenKit] = useState(null);
  const [copied, setCopied] = useState(null);

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.success) setJobs(data.jobs || []);
    } catch (err) {
      console.error("Failed to load jobs", err);
    }
    setLoading(false);
  }

  async function loadKit() {
    try {
      const res = await fetch("/api/kit");
      const data = await res.json();
      if (data.success) setKit(data.kit);
    } catch (err) {
      console.error("Failed to load apply kit", err);
    }
  }

  useEffect(() => {
    loadJobs();
    loadKit();
  }, []);

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch (err) {
      window.alert("Could not copy. Select the text and copy it by hand.");
    }
  }

  async function updateStatus(row, status) {
    setBusyRow(row);
    let data = null;
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, status }),
      });
      data = await res.json();
      if (!res.ok) window.alert(data.error || "Could not update the job.");
      await loadJobs();
    } catch (err) {
      console.error("Failed to update status", err);
    }
    setBusyRow(null);
    return data;
  }

  // Approve sends the application right away for email jobs, so confirm first.
  async function approve(job) {
    const email = applyEmailOf(job);
    if (
      email &&
      !window.confirm(
        `This sends your CV to ${email} right now and cannot be undone. Continue?`,
      )
    ) {
      return;
    }
    const data = await updateStatus(job._row, "Approved");
    if (email && data && data.sent === false) {
      window.alert(
        "The email could not be sent. The job stays Approved and the next run will retry. Check the email settings in .env.local.",
      );
    }
  }

  async function clearAll() {
    if (
      !window.confirm("Delete every job row from the sheet? The header stays.")
    )
      return;
    const res = await fetch("/api/clear", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || "Could not clear the sheet.");
      return;
    }
    await loadJobs();
  }

  const counts = useMemo(() => {
    const c = {};
    for (const tab of TABS) {
      c[tab.key] = jobs.filter((j) => tab.match(j.Status || "")).length;
    }
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab) || TABS[0];
    return jobs
      .filter((j) => tab.match(j.Status || ""))
      .sort(
        (a, b) => Number(b["Match Score"] || 0) - Number(a["Match Score"] || 0),
      );
  }, [jobs, activeTab]);

  return (
    <div className="wrap">
      <div className="pageHead">
        <div>
          <h1 className="wordmark">Job Pipeline</h1>
          <div className="tagline">Daniel&rsquo;s application tracker</div>
        </div>
        <div className="headActions">
          <button className="ghostBtn" onClick={loadJobs}>
            Refresh
          </button>
          <button className="ghostBtn danger" onClick={clearAll}>
            Clear all
          </button>
        </div>
      </div>

      <div className="statRow">
        <div className="stat">
          <span className="statNumber">{counts.all || 0}</span>
          <span className="statLabel">Total tracked</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.awaiting || 0}</span>
          <span className="statLabel">Awaiting approval</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.manual || 0}</span>
          <span className="statLabel">Needs manual apply</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.applied || 0}</span>
          <span className="statLabel">Applied</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.interview || 0}</span>
          <span className="statLabel">Interviews</span>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading jobs...</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          Nothing here yet. The next daily run will add new matches.
        </div>
      ) : (
        <div className="panel">
          {visible.map((job) => {
            const applyEmail = applyEmailOf(job);
            const links = linkedinLinks(job.Company);
            const kitOpen = openKit === job._row;
            return (
              <div className="jobRow" key={job._row}>
                <div className="jobMain">
                  <p className="jobTitle">
                    <a
                      href={job.Link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {job["Role Title"] || "Untitled role"}
                    </a>
                  </p>
                  <div className="jobCompany">
                    <span className="company">
                      {job.Company || "Unknown company"}
                    </span>
                    {job["Country/Remote"] && (
                      <span className="location">{job["Country/Remote"]}</span>
                    )}
                    {job["Employment Type"] &&
                      job["Employment Type"] !== "Not specified" && (
                        <span className="location">
                          {job["Employment Type"]}
                        </span>
                      )}
                  </div>
                  <div className="jobMetaLine">
                    {job["Match Score"] && (
                      <span className="scoreTag">
                        Match {job["Match Score"]}
                      </span>
                    )}
                    {job["CV Version Used"] && (
                      <span className="cvTag">
                        {CV_LABEL[job["CV Version Used"]] ||
                          job["CV Version Used"]}
                      </span>
                    )}
                    <span
                      className="statusPill"
                      style={{
                        color: STATUS_COLOR[job.Status] || "var(--status-none)",
                      }}
                    >
                      {job.Status}
                    </span>
                  </div>
                  {applyEmail && (
                    <div className="applyEmail">
                      Applies by email to {applyEmail}
                    </div>
                  )}
                  <div className="liLinks">
                    <a
                      href={links.company}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Company on LinkedIn
                    </a>
                    <a
                      href={links.recruiters}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Find recruiters
                    </a>
                    <a
                      href={links.engineers}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Find engineers
                    </a>
                  </div>
                  {kitOpen && kit && (
                    <KitPanel
                      job={job}
                      kit={kit}
                      copied={copied}
                      onCopy={copy}
                    />
                  )}
                </div>
                <div className="jobActions">
                  {job.Status === "Awaiting Your Approval" && (
                    <>
                      <button
                        className="actionBtn primary"
                        disabled={busyRow === job._row}
                        onClick={() => approve(job)}
                      >
                        Approve
                      </button>
                      <button
                        className="actionBtn"
                        disabled={busyRow === job._row}
                        onClick={() => updateStatus(job._row, "Rejected")}
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {job.Status === "Needs Manual Apply" && (
                    <button
                      className="actionBtn primary"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Applied")}
                    >
                      Mark Applied
                    </button>
                  )}
                  {(job.Status === "Applied" ||
                    job.Status === "Applied (Auto)") && (
                    <button
                      className="actionBtn"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Interview")}
                    >
                      Got Interview
                    </button>
                  )}
                  {KIT_STATUSES.includes(job.Status) && (
                    <button
                      className="actionBtn"
                      onClick={() => setOpenKit(kitOpen ? null : job._row)}
                    >
                      {kitOpen ? "Hide kit" : "Apply kit"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
