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

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [busyRow, setBusyRow] = useState(null);

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

  useEffect(() => {
    loadJobs();
  }, []);

  async function updateStatus(row, status) {
    setBusyRow(row);
    try {
      await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, status }),
      });
      await loadJobs();
    } catch (err) {
      console.error("Failed to update status", err);
    }
    setBusyRow(null);
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
          {visible.map((job) => (
            <div className="jobRow" key={job._row}>
              <div className="jobMain">
                <p className="jobTitle">
                  <a href={job.Link} target="_blank" rel="noopener noreferrer">
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
                      <span className="location">{job["Employment Type"]}</span>
                    )}
                </div>
                <div className="jobMetaLine">
                  {job["Match Score"] && (
                    <span className="scoreTag">Match {job["Match Score"]}</span>
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
                <div className="liLinks">
                  <a
                    href={linkedinLinks(job.Company).company}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Company on LinkedIn
                  </a>
                  <a
                    href={linkedinLinks(job.Company).recruiters}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Find recruiters
                  </a>
                  <a
                    href={linkedinLinks(job.Company).engineers}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Find engineers
                  </a>
                </div>
              </div>
              <div className="jobActions">
                {job.Status === "Awaiting Your Approval" && (
                  <>
                    <button
                      className="actionBtn primary"
                      disabled={busyRow === job._row}
                      onClick={() =>
                        updateStatus(
                          job._row,
                          job["Submission Method"] === "Email"
                            ? "Approved"
                            : "Needs Manual Apply",
                        )
                      }
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
