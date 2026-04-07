from typing import Any, List, Optional

from pydantic import BaseModel, Field


class JobCreateRequest(BaseModel):
    title: str
    department: str
    job_role: str = ""
    description: str
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    min_experience_years: float = 0


class JobResponse(JobCreateRequest):
    id: str
    status: str
    created_at: str


class JobListResponse(BaseModel):
    items: List[JobResponse]


class JobRoleCatalogItem(BaseModel):
    role: str
    required_skills: List[str]
    preferred_skills: List[str]
    preferred_qualifications: List[str]


class JobRoleCatalogResponse(BaseModel):
    items: List[JobRoleCatalogItem]


class CandidateSummary(BaseModel):
    id: str
    job_id: str
    name: str
    email: Optional[str] = None
    filename: str
    score: float
    skill_match_percentage: float
    experience_relevance: float
    recommendation: str
    status: str
    created_at: str
    semantic_similarity: float
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None


class CandidateDetailResponse(CandidateSummary):
    pros: List[str]
    cons: List[str]
    strengths: List[str]
    weaknesses: List[str]
    explanation: str
    extracted_skills: List[str]
    experience_years: float
    education: str
    semantic_similarity: float
    resume_excerpt: str
    resume_text: str
    interview_questions: List[str] = Field(default_factory=list)
    improvement_suggestions: List[str] = Field(default_factory=list)
    bias_flags: List[str] = Field(default_factory=list)
    projects: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    schooling_10: str = ""
    schooling_12: str = ""
    uploaded_documents: List[str] = Field(default_factory=list)


class CandidateListResponse(BaseModel):
    items: List[CandidateSummary]


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    organization_id: str
    full_name: str
    email: str
    role: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class CandidateUploadResponse(BaseModel):
    job_id: str
    uploaded: int
    candidate_ids: List[str]
    message: str
    analyses: List["AnalysisResponse"]


class CandidateIntakeResponse(BaseModel):
    candidate_id: str
    job_id: str
    status: str
    message: str


class ScoreBreakdown(BaseModel):
    skill_match: float
    experience: float
    education: float
    additional: float
    total: float
    semantic_similarity: float


class AnalysisResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: Optional[str] = None
    score: ScoreBreakdown
    pros: List[str]
    cons: List[str]
    strengths: List[str]
    weaknesses: List[str]
    recommendation: str
    explanation: str
    interview_questions: List[str] = Field(default_factory=list)
    improvement_suggestions: List[str] = Field(default_factory=list)
    bias_flags: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)


class DashboardMetricsResponse(BaseModel):
    total_candidates: int
    shortlisted: int
    consider: int
    rejected: int
    total_jobs: int
    average_score: float
    average_skill_match: float
    average_experience_fit: float


class ActivityItem(BaseModel):
    id: str
    actor: str
    action: str
    created_at: str


class ActivityListResponse(BaseModel):
    items: List[ActivityItem]


class TeamListResponse(BaseModel):
    items: List[UserResponse]


class InterviewQuestionsResponse(BaseModel):
    candidate_id: str
    questions: List[str]


class ExportResponse(BaseModel):
    filename: str
    content: str


class JobAnalyticsPoint(BaseModel):
    label: str
    candidates: int
    average_score: float


class JobAnalyticsResponse(BaseModel):
    items: List[JobAnalyticsPoint]
