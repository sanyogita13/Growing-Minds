"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { AuthGuard } from "../../components/auth-guard";
import { LogoutButton } from "../../components/logout-button";
import { apiFetch, getStoredToken } from "../../lib/api";

type Job = {
  id: string;
  title: string;
  department: string;
  job_role: string;
  description: string;
  required_skills: string[];
  preferred_skills: string[];
  min_experience_years: number;
  status: string;
  created_at: string;
};

type Candidate = {
  id: string;
  name: string;
  filename: string;
  score: number;
  recommendation: string;
  skill_match_percentage: number;
  semantic_similarity: number;
  status: string;
  phone?: string;
  linkedin?: string;
  github?: string;
};

type Metrics = {
  total_candidates: number;
  shortlisted: number;
  consider: number;
  rejected: number;
  total_jobs: number;
  average_score: number;
};

type JobRoleCatalogItem = {
  role: string;
  required_skills: string[];
  preferred_skills: string[];
  preferred_qualifications: string[];
};

const initialJob = {
  title: "Software Engineer Intern",
  department: "Engineering",
  jobRole: "Software Engineer",
  description: "Assess engineering fundamentals, coding ability, frameworks, and project quality.",
  requiredSkills: "",
  preferredSkills: "",
  minExperience: "0",
};

const initialCandidateForm = {
  name: "",
  email: "",
  phone: "",
  linkedin: "",
  github: "",
  experienceYears: "0",
  education: "",
  schooling10: "",
  schooling12: "",
  skills: "",
  projects: "",
  certifications: "",
  summary: "",
};

export default function HrDashboardPage() {
  const token = useMemo(() => getStoredToken(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRoleCatalogItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [jobForm, setJobForm] = useState(initialJob);
  const [candidateForm, setCandidateForm] = useState(initialCandidateForm);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [recommendationFilter, setRecommendationFilter] = useState("");

  async function refreshJobs() {
    if (!token) {
      return;
    }
    const response = await apiFetch<{ items: Job[] }>("/api/v1/jobs", {}, token);
    setJobs(response.items);
    if (!selectedJobId && response.items[0]) {
      setSelectedJobId(response.items[0].id);
    }
  }

  async function refreshJobRoles() {
    if (!token) {
      return;
    }
    const response = await apiFetch<{ items: JobRoleCatalogItem[] }>("/api/v1/job-roles", {}, token);
    setJobRoles(response.items);
  }

  async function refreshMetrics() {
    if (!token) {
      return;
    }
    const response = await apiFetch<Metrics>("/api/v1/dashboard/overview", {}, token);
    setMetrics(response);
  }

  async function refreshCandidates(jobId: string) {
    if (!token || !jobId) {
      return;
    }
    const params = new URLSearchParams();
    if (search) {
      params.set("search", search);
    }
    if (recommendationFilter) {
      params.set("recommendation", recommendationFilter);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await apiFetch<{ items: Candidate[] }>(`/api/v1/jobs/${jobId}/candidates${suffix}`, {}, token);
    setCandidates(response.items);
  }

  useEffect(() => {
    refreshJobs().catch(console.error);
    refreshJobRoles().catch(console.error);
    refreshMetrics().catch(console.error);
  }, [token]);

  useEffect(() => {
    if (selectedJobId) {
      refreshCandidates(selectedJobId).catch(console.error);
    }
  }, [selectedJobId, search, recommendationFilter]);

  async function handleJobSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setMessage("Saving job configuration...");
    try {
      await apiFetch<Job>(
        "/api/v1/jobs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: jobForm.title,
            department: jobForm.department,
            job_role: jobForm.jobRole,
            description: jobForm.description,
            required_skills: commaList(jobForm.requiredSkills),
            preferred_skills: commaList(jobForm.preferredSkills),
            min_experience_years: Number(jobForm.minExperience),
          }),
        },
        token,
      );
      setMessage("Job created. Required skills now come only from your inputs unless left blank.");
      await refreshJobs();
      await refreshMetrics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save job.");
    }
  }

  async function handleCandidateIntake(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedJobId) {
      setMessage("Select a job before uploading a candidate.");
      return;
    }
    if (!candidateForm.name.trim()) {
      setMessage("Candidate name is required.");
      return;
    }
    if (!uploadFiles?.length) {
      setMessage("Upload at least one resume or marksheet PDF/CSV document.");
      return;
    }

    const params = new URLSearchParams({
      job_id: selectedJobId,
      name: candidateForm.name,
      email: candidateForm.email,
      phone: candidateForm.phone,
      linkedin: candidateForm.linkedin,
      github: candidateForm.github,
      experience_years: candidateForm.experienceYears || "0",
      education: candidateForm.education || "Not specified",
      schooling_10: candidateForm.schooling10,
      schooling_12: candidateForm.schooling12,
      skills: candidateForm.skills,
      projects: candidateForm.projects,
      certifications: candidateForm.certifications,
      summary: candidateForm.summary,
    });

    const formData = new FormData();
    Array.from(uploadFiles).forEach((file) => formData.append("files", file));
    setMessage("Uploading candidate profile...");
    try {
      await apiFetch(`/api/v1/candidates/intake?${params.toString()}`, { method: "POST", body: formData }, token);
      setMessage("Candidate uploaded. Review the list and click Analyze when ready.");
      setCandidateForm(initialCandidateForm);
      setUploadFiles(null);
      await refreshCandidates(selectedJobId);
      await refreshMetrics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload candidate.");
    }
  }

  async function handleBulkUpload() {
    if (!token || !selectedJobId || !uploadFiles?.length) {
      setMessage("Choose a job and upload at least one PDF or CSV file.");
      return;
    }
    const formData = new FormData();
    Array.from(uploadFiles).forEach((file) => formData.append("files", file));
    setMessage("Uploading files...");
    try {
      await apiFetch(`/api/v1/candidates/upload?job_id=${selectedJobId}`, { method: "POST", body: formData }, token);
      setMessage("Files uploaded. CSV rows are analyzed immediately; PDF resumes stay in the uploaded list until you click Analyze.");
      await refreshCandidates(selectedJobId);
      await refreshMetrics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload files.");
    }
  }

  async function handleAnalyze(candidateId: string) {
    if (!token) {
      return;
    }
    setMessage("Analyzing candidate...");
    try {
      await apiFetch(`/api/v1/candidates/${candidateId}/analyze`, { method: "POST" }, token);
      setMessage("Candidate analyzed.");
      if (selectedJobId) {
        await refreshCandidates(selectedJobId);
      }
      await refreshMetrics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to analyze candidate.");
    }
  }

  return (
    <AuthGuard>
      <main className="shell">
        <aside className="sidebar">
          <div className="pill">HR Workspace</div>
          <h1>Candidate Intake and Analysis</h1>
          <p className="muted">
            Upload candidate documents, fill their profile details, and trigger analysis only when HR is ready.
          </p>
          <div className="grid">
            <Link href="/admin">Open Admin Dashboard</Link>
            <LogoutButton />
          </div>
        </aside>

        <section className="content grid">
          <section className="grid metrics">
            {[
              ["Candidates", metrics?.total_candidates ?? 0],
              ["Shortlisted", metrics?.shortlisted ?? 0],
              ["Consider", metrics?.consider ?? 0],
              ["Rejected", metrics?.rejected ?? 0],
            ].map(([label, value]) => (
              <article className="panel metricCard" key={String(label)}>
                <div className="muted">{label}</div>
                <h2>{value}</h2>
              </article>
            ))}
          </section>

          <section className="dashboardTwoCol">
            <form className="panel hero grid" onSubmit={handleJobSubmit}>
              <div className="pill">Job Setup</div>
              <input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} style={inputStyle} placeholder="Job title" />
              <input value={jobForm.department} onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })} style={inputStyle} placeholder="Department" />
              <select value={jobForm.jobRole} onChange={(e) => setJobForm({ ...jobForm, jobRole: e.target.value })} style={inputStyle}>
                {jobRoles.map((role) => (
                  <option key={role.role} value={role.role}>
                    {role.role}
                  </option>
                ))}
              </select>
              <textarea
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                style={{ ...inputStyle, minHeight: 110 }}
                placeholder="Role description"
              />
              <input
                value={jobForm.requiredSkills}
                onChange={(e) => setJobForm({ ...jobForm, requiredSkills: e.target.value })}
                style={inputStyle}
                placeholder="Required skills (comma separated)"
              />
              <input
                value={jobForm.preferredSkills}
                onChange={(e) => setJobForm({ ...jobForm, preferredSkills: e.target.value })}
                style={inputStyle}
                placeholder="Preferred skills (comma separated)"
              />
              <input
                value={jobForm.minExperience}
                onChange={(e) => setJobForm({ ...jobForm, minExperience: e.target.value })}
                type="number"
                style={inputStyle}
                placeholder="Minimum experience"
              />
              <button style={buttonStyle} type="submit">Save Job</button>
            </form>

            <div className="panel hero grid">
              <div className="pill">Role Mix</div>
              <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} style={inputStyle}>
                <option value="">Select a job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} ({job.job_role || "Custom"})
                  </option>
                ))}
              </select>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Shortlist", value: metrics?.shortlisted ?? 0 },
                        { name: "Consider", value: metrics?.consider ?? 0 },
                        { name: "Reject", value: metrics?.rejected ?? 0 },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={72}
                    >
                      {["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"].map((color) => (
                        <Cell key={color} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="muted">
                Accuracy can be improved with better candidate details and documents, but we should not claim a fixed 92% guarantee.
              </p>
            </div>
          </section>

          <section className="dashboardTwoCol">
            <form className="panel hero grid" onSubmit={handleCandidateIntake}>
              <div className="pill">Candidate Intake Form</div>
              <div className="formGrid">
                <input value={candidateForm.name} onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })} style={inputStyle} placeholder="Full name" />
                <input value={candidateForm.email} onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })} style={inputStyle} placeholder="Email" />
                <input value={candidateForm.phone} onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })} style={inputStyle} placeholder="Phone" />
                <input value={candidateForm.linkedin} onChange={(e) => setCandidateForm({ ...candidateForm, linkedin: e.target.value })} style={inputStyle} placeholder="LinkedIn URL" />
                <input value={candidateForm.github} onChange={(e) => setCandidateForm({ ...candidateForm, github: e.target.value })} style={inputStyle} placeholder="GitHub URL" />
                <input value={candidateForm.experienceYears} onChange={(e) => setCandidateForm({ ...candidateForm, experienceYears: e.target.value })} type="number" style={inputStyle} placeholder="Experience years" />
                <input value={candidateForm.education} onChange={(e) => setCandidateForm({ ...candidateForm, education: e.target.value })} style={inputStyle} placeholder="Current education" />
                <input value={candidateForm.schooling10} onChange={(e) => setCandidateForm({ ...candidateForm, schooling10: e.target.value })} style={inputStyle} placeholder="10th marks / board" />
                <input value={candidateForm.schooling12} onChange={(e) => setCandidateForm({ ...candidateForm, schooling12: e.target.value })} style={inputStyle} placeholder="12th marks / board" />
                <input value={candidateForm.skills} onChange={(e) => setCandidateForm({ ...candidateForm, skills: e.target.value })} style={inputStyle} placeholder="Skills (comma separated)" />
              </div>
              <textarea value={candidateForm.projects} onChange={(e) => setCandidateForm({ ...candidateForm, projects: e.target.value })} style={{ ...inputStyle, minHeight: 90 }} placeholder="Projects (use | between projects)" />
              <textarea value={candidateForm.certifications} onChange={(e) => setCandidateForm({ ...candidateForm, certifications: e.target.value })} style={{ ...inputStyle, minHeight: 70 }} placeholder="Certifications (comma separated)" />
              <textarea value={candidateForm.summary} onChange={(e) => setCandidateForm({ ...candidateForm, summary: e.target.value })} style={{ ...inputStyle, minHeight: 110 }} placeholder="Profile summary / experience notes" />
              <input type="file" accept=".pdf,.docx,.txt,.csv" multiple onChange={(e) => setUploadFiles(e.target.files)} style={inputStyle} />
              <p className="muted">
                Upload the resume PDF plus supporting PDFs like 10th and 12th marksheets. CSV is still supported for bulk datasets.
              </p>
              <div className="buttonRow">
                <button style={buttonStyle} type="submit">Save Candidate</button>
                <button style={secondaryButtonStyle} type="button" onClick={() => handleBulkUpload().catch(console.error)}>
                  Quick Upload CSV/PDF
                </button>
              </div>
            </form>

            <section className="panel hero grid">
              <div className="pill">Uploaded Candidates</div>
              <div className="filterRow">
                <input value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} placeholder="Search by name" />
                <select value={recommendationFilter} onChange={(e) => setRecommendationFilter(e.target.value)} style={inputStyle}>
                  <option value="">All statuses</option>
                  <option value="Shortlist">Shortlist</option>
                  <option value="Consider">Consider</option>
                  <option value="Reject">Reject</option>
                </select>
              </div>
              <div className="grid">
                {candidates.map((candidate) => (
                  <div className="panel metricCard candidateRow" key={candidate.id}>
                    <div>
                      <strong>{candidate.name}</strong>
                      <div className="muted">{candidate.filename}</div>
                      <div className="muted">{candidate.phone ?? "No phone"} {candidate.linkedin ? "• LinkedIn added" : ""}</div>
                      <div>Status: {candidate.status}</div>
                      <div>Score: {candidate.score || 0}/100</div>
                    </div>
                    <div className="candidateActions">
                      <Link href={`/hr/candidates/${candidate.id}`} className="pill">View</Link>
                      <button
                        style={candidate.status === "Analyzed" ? secondaryButtonStyle : buttonStyle}
                        type="button"
                        onClick={() => handleAnalyze(candidate.id).catch(console.error)}
                      >
                        {candidate.status === "Analyzed" ? "Re-analyze" : "Analyze"}
                      </button>
                    </div>
                  </div>
                ))}
                {!candidates.length ? <div className="muted">No uploaded candidates for this job yet.</div> : null}
              </div>
            </section>
          </section>

          {message ? <div className="panel hero"><p style={{ margin: 0 }}>{message}</p></div> : null}
        </section>
      </main>
    </AuthGuard>
  );
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const inputStyle = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255, 255, 255, 0.1)",
  background: "rgba(255, 255, 255, 0.03)",
  width: "100%",
};

const buttonStyle = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "#f5f5f5",
  color: "#050505",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "transparent",
  color: "#f5f5f5",
  cursor: "pointer",
};
