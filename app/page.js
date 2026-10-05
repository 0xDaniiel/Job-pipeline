"use client";

import { useEffect, useState, useMemo } from "react";

const STATUS_COLOR = {
  "Awaiting Your Approval": "var(--status-awaiting)",
  "Approved": "var(--status-approved)",
  "Applied (Auto)": "var(--status-applied)",
  "Needs Manual Apply": "var(--status-manual)",
  "Interview": "var(--status-interview)",
  "Rejected": "var(--status-rejected)",
  "No Response": "var(--status-none)",
  "Follow-up Sent": "var(--status-approved)",
};

const TABS = [
  { key: "all", label: "All" },
  { key: "Awaiting Your Approval", label: "Awaiting Approval" },
  { key: "Needs Manual Apply", label: "Needs Manual Apply" },
  { key: "Applied (Auto)", label: "Applied" },
  { key: "Interview", label: "Interview" },
  { key: "Rejected", label: "Rejected" },
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

  const counts = useMemo(() => {
    const c = { total: jobs.length };
    for (const j of jobs) {
      c[j.Status] = (c[j.Status] || 0) + 1;
    }
    return c;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return jobs;
    return jobs.filter((j) => j.Status === activeTab);
  }, [jobs, activeTab]);

  return (
    <div className="wrap">
      <div className="pageHead">
        <div>
          <h1 className="wordmark">Job Pipeline</h1>
          <div className="tagline">Daniel&rsquo;s application tracker</div>
        </div>
        <button className="refreshBtn" onClick={loadJobs}>
          Refresh
        </button>
      </div>

      <div className="statRow">
        <div className="stat">
          <span className="statNumber">{counts.total || 0}</span>
          <span className="statLabel">Total tracked</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts["Awaiting Your Approval"] || 0}</span>
          <span className="statLabel">Awaiting approval</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts["Needs Manual Apply"] || 0}</span>
          <span className="statLabel">Needs manual apply</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts["Applied (Auto)"] || 0}</span>
          <span className="statLabel">Applied</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts["Interview"] || 0}</span>
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
      ) : filtered.length === 0 ? (
        <div className="empty">Nothing here yet. The next daily run will add new matches.</div>
      ) : (
        <div className="jobList">
          {filtered.map((job) => (
            <div className="jobRow" key={job._row}>
              <div className="jobMain">
                <p className="jobTitle">
                  <a href={job.Link} target="_blank" rel="noopener noreferrer">
                    {job["Role Title"] || "Untitled role"}
                  </a>
                </p>
                <div className="jobMeta">
                  {job.Company || "Unknown company"}
                  {job["Country/Remote"] ? `, ${job["Country/Remote"]}` : ""}
                  {job["Employment Type"] ? `, ${job["Employment Type"]}` : ""}
                </div>
                <div className="jobMetaLine">
                  {job["Match Score"] && (
                    <span className="scoreTag">Match {job["Match Score"]}</span>
                  )}
                  {job["CV Version Used"] && (
                    <span className="jobMeta">{job["CV Version Used"]}</span>
                  )}
                  <span
                    className="statusPill"
                    style={{ color: STATUS_COLOR[job.Status] || "var(--status-none)" }}
                  >
                    {job.Status}
                  </span>
                </div>
              </div>
              <div className="jobActions">
                {job.Status === "Awaiting Your Approval" && (
                  <>
                    <button
                      className="actionBtn primary"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Approved")}
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
                    onClick={() => updateStatus(job._row, "Applied (Auto)")}
                  >
                    Mark Applied
                  </button>
                )}
                {job.Status === "Applied (Auto)" && (
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
