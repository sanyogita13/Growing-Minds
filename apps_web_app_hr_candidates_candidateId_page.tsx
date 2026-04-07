"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthGuard } from "../../../../components/auth-guard";
import { LogoutButton } from "../../../../components/logout-button";
import { apiFetch, getStoredToken } from "../../../../lib/api";

type CandidateDetail = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  filename: string;
  score: number;
  skill_match_percentage: number;
  experience_relevance: number;
  recommendation: string;
  pros: string[];
  cons: string[];
  explanation: string;
  extracted_skills: string[];
  experience_years: number;
  education: string;
  semantic_similarity: number;
  resume_excerpt: string;
  interview_questions: string[];
  improvement_suggestions: string[];
  bias_flags: string[];
  projects: string[];
  certifications: string[];
  missing_skills: string[];
  schooling_10: string;
  schooling_12: string;
  uploaded_documents: string[];
};

export default function CandidateAnalysisPage() {
  const params = useParams<{ candidateId: string }>();
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token || !params?.candidateId) {
      return;
    }
    apiFetch<CandidateDetail>(`/api/v1/candidates/${params.candidateId}`, {}, token)
      .then(setCandidate)
      .catch(console.error);
  }, [params]);

  return (
    <AuthGuard>
      <main className="content">
        <div className="panel hero">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div>
              <div className="pill">Candidate Analysis</div>
              <h1>{candidate?.name ?? "Loading..."}</h1>
              <p className="muted">{candidate?.explanation}</p>
            </div>
            <LogoutButton />
          </div>

          {candidate ? (
            <div className="grid">
              <section className="grid metrics">
                {[
                  ["Overall Score", candidate.score],
                  ["Skill Match", candidate.skill_match_percentage],
                  ["Experience", candidate.experience_relevance],
                  ["Semantic Fit", candidate.semantic_similarity],
                ].map(([label, value]) => (
                  <article className="panel metricCard" key={String(label)}>
                    <div className="muted">{label}</div>
                    <h2>{value}%</h2>
                  </article>
                ))}
              </section>

              <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                <article className="panel hero">
                  <h2>Pros</h2>
                  {candidate.pros.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
                <article className="panel hero">
                  <h2>Cons</h2>
                  {candidate.cons.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
              </section>

              <section className="panel hero">
                <h2>Parsed Resume Signals</h2>
                <p><strong>Recommendation:</strong> {candidate.recommendation}</p>
                <p><strong>Email:</strong> {candidate.email ?? "Not detected"}</p>
                <p><strong>Phone:</strong> {candidate.phone ?? "Not detected"}</p>
                <p><strong>LinkedIn:</strong> {candidate.linkedin ?? "Not provided"}</p>
                <p><strong>GitHub:</strong> {candidate.github ?? "Not provided"}</p>
                <p><strong>Experience Years:</strong> {candidate.experience_years}</p>
                <p><strong>Education:</strong> {candidate.education}</p>
                <p><strong>10th Details:</strong> {candidate.schooling_10 || "Not provided"}</p>
                <p><strong>12th Details:</strong> {candidate.schooling_12 || "Not provided"}</p>
                <p><strong>Skills:</strong> {candidate.extracted_skills.join(", ") || "None detected"}</p>
                <p><strong>Resume Preview:</strong> {candidate.resume_excerpt}</p>
              </section>

              <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                <article className="panel hero">
                  <h2>Interview Questions</h2>
                  {candidate.interview_questions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </article>
                <article className="panel hero">
                  <h2>Improvement Suggestions</h2>
                  {candidate.improvement_suggestions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                  {!candidate.improvement_suggestions.length ? <p>No suggestions generated.</p> : null}
                </article>
              </section>

              <section className="panel hero">
                <h2>Projects</h2>
                {candidate.projects.length ? candidate.projects.map((item) => <p key={item}>{item}</p>) : <p>No projects extracted.</p>}
              </section>

              <section className="panel hero">
                <h2>Certifications and Missing Skills</h2>
                <p><strong>Certifications:</strong> {candidate.certifications.join(", ") || "None found"}</p>
                <p><strong>Missing Skills:</strong> {candidate.missing_skills.join(", ") || "No major missing skills detected"}</p>
              </section>

              <section className="panel hero">
                <h2>Uploaded Documents</h2>
                {candidate.uploaded_documents.length ? (
                  candidate.uploaded_documents.map((item) => <p key={item}>{item}</p>)
                ) : (
                  <p>No uploaded documents listed.</p>
                )}
              </section>

              <section className="panel hero">
                <h2>Bias and Compliance Notes</h2>
                {candidate.bias_flags.length ? (
                  candidate.bias_flags.map((item) => <p key={item}>{item}</p>)
                ) : (
                  <p>No protected-attribute-like fields were flagged in this resume.</p>
                )}
              </section>
            </div>
          ) : (
            <p>Loading candidate details...</p>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
