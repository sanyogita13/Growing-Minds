from datetime import UTC, datetime
import csv
import io
from typing import Annotated, Any, List
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .auth import create_access_token, seeded_users, verify_password
from .config import settings
from .dependencies import get_current_user, require_role
from .schemas import (
    ActivityItem,
    ActivityListResponse,
    AnalysisResponse,
    AuthResponse,
    CandidateDetailResponse,
    CandidateIntakeResponse,
    CandidateListResponse,
    CandidateSummary,
    CandidateUploadResponse,
    DashboardMetricsResponse,
    ExportResponse,
    InterviewQuestionsResponse,
    JobAnalyticsPoint,
    JobAnalyticsResponse,
    JobRoleCatalogItem,
    JobRoleCatalogResponse,
    JobCreateRequest,
    JobListResponse,
    JobResponse,
    LoginRequest,
    TeamListResponse,
    UserResponse,
)
from .services.ai import analyze_candidate_for_job
from .services.job_intelligence import get_role_profile, load_job_roles, merge_job_requirements
from .services.parsing import (
    extract_certifications,
    extract_email,
    extract_projects,
    extract_skills,
    normalize_text,
    parse_resume_document,
)
from .store import append_activity, load_store, now_iso, save_store

app = FastAPI(title=settings.app_name, version=settings.api_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SOCKETS: List[WebSocket] = []
USERS = {user.email: user for user in seeded_users()}


def serialize_user(email: str) -> UserResponse:
    user = USERS[email]
    return UserResponse(
        id=user.id,
        organization_id=user.organization_id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
    )


def get_user_by_id(user_id: str) -> UserResponse:
    for email in USERS:
        user = serialize_user(email)
        if user.id == user_id:
            return user
    raise HTTPException(status_code=404, detail="User not found")


def require_job(state: dict[str, Any], job_id: str) -> dict[str, Any]:
    job = state["jobs"].get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def require_candidate(state: dict[str, Any], candidate_id: str) -> dict[str, Any]:
    candidate = state["candidates"].get(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


def candidate_summary_from_record(candidate: dict[str, Any], analysis: dict[str, Any]) -> CandidateSummary:
    score = analysis.get("score", {})
    return CandidateSummary(
        id=candidate["id"],
        job_id=candidate["job_id"],
        name=candidate["name"],
        email=candidate.get("email"),
        filename=candidate["filename"],
        score=score.get("total", 0.0),
        skill_match_percentage=score.get("skill_match", 0.0),
        experience_relevance=score.get("experience", 0.0),
        recommendation=analysis.get("recommendation", "Pending"),
        status=candidate.get("status", "Pending"),
        created_at=candidate["created_at"],
        semantic_similarity=score.get("semantic_similarity", 0.0),
        phone=candidate.get("phone"),
        linkedin=candidate.get("linkedin"),
        github=candidate.get("github"),
    )


def allowed_upload(filename: str) -> bool:
    return filename.lower().endswith((".pdf", ".csv", ".docx", ".txt"))


def filter_candidates(
    candidates: list[CandidateSummary],
    search: str | None = None,
    recommendation: str | None = None,
    min_score: float | None = None,
) -> list[CandidateSummary]:
    items = candidates
    if search:
        needle = search.lower()
        items = [item for item in items if needle in item.name.lower() or needle in item.filename.lower()]
    if recommendation:
        items = [item for item in items if item.recommendation.lower() == recommendation.lower()]
    if min_score is not None:
        items = [item for item in items if item.score >= min_score]
    return items


def create_candidate_analysis(
    state: dict[str, Any],
    job: JobResponse,
    *,
    filename: str,
    name: str,
    email: str | None,
    resume_text: str,
    experience_years: float,
    education: str,
    skills: list[str],
    projects: list[str] | None = None,
    certifications: list[str] | None = None,
    candidate_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AnalysisResponse:
    candidate_id = candidate_id or str(uuid4())
    normalized = normalize_text(resume_text)
    resume = {
        "skills": skills,
        "experience_years": experience_years,
        "education": education,
        "resume_text": normalized,
        "projects": projects or [],
        "certifications": certifications or [],
    }
    analysis = analyze_candidate_for_job(candidate_id=candidate_id, job=job, resume=resume)
    metadata = metadata or {}
    record = {
        "id": candidate_id,
        "job_id": job.id,
        "name": name,
        "email": email,
        "filename": filename,
        "created_at": now_iso(),
        "resume_text": normalized,
        "resume_excerpt": normalized[:400],
        "extracted_skills": skills,
        "experience_years": experience_years,
        "education": education,
        "projects": projects or [],
        "certifications": certifications or [],
        "phone": metadata.get("phone"),
        "linkedin": metadata.get("linkedin"),
        "github": metadata.get("github"),
        "schooling_10": metadata.get("schooling_10", ""),
        "schooling_12": metadata.get("schooling_12", ""),
        "uploaded_documents": metadata.get("uploaded_documents", []),
        "status": "Analyzed",
        "analysis_id": analysis.id,
    }
    state["candidates"][candidate_id] = record
    state["analyses"][analysis.id] = analysis.model_dump()
    return analysis


def process_csv_upload(state: dict[str, Any], job: JobResponse, filename: str, raw: bytes) -> list[AnalysisResponse]:
    decoded = raw.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(decoded))
    analyses: list[AnalysisResponse] = []
    for index, row in enumerate(reader, start=1):
        resume_text = (row.get("resume_text") or row.get("summary") or "").strip()
        skills = [
            item.strip()
            for item in (row.get("skills") or "").split(",")
            if item.strip()
        ] or extract_skills(resume_text)
        raw_experience = (row.get("experience_years") or "0").strip() or "0"
        try:
            experience_years = float(raw_experience)
        except ValueError:
            experience_years = 0.0
        education = (row.get("education") or "").strip() or extract_education(resume_text)
        name = (row.get("name") or "").strip() or f"Candidate {index}"
        email = (row.get("email") or "").strip() or extract_email(resume_text)
        certifications = [
            item.strip()
            for item in (row.get("certifications") or "").split(",")
            if item.strip()
        ] or extract_certifications(resume_text)
        projects = [
            item.strip()
            for item in (row.get("projects") or "").split("|")
            if item.strip()
        ] or extract_projects(resume_text)
        if not resume_text:
            resume_text = (
                f"{name}. Skills: {', '.join(skills) if skills else 'Not specified'}. "
                f"Experience: {experience_years} years. Education: {education}."
            )
        analyses.append(
            create_candidate_analysis(
                state,
                job,
                filename=f"{filename}::row-{index}",
                name=name,
                email=email,
                resume_text=resume_text,
                experience_years=experience_years,
                education=education,
                skills=skills,
                projects=projects,
                certifications=certifications,
                metadata={
                    "phone": (row.get("phone") or "").strip() or None,
                    "linkedin": (row.get("linkedin") or "").strip() or None,
                    "github": (row.get("github") or "").strip() or None,
                    "schooling_10": (row.get("schooling_10") or "").strip(),
                    "schooling_12": (row.get("schooling_12") or "").strip(),
                    "uploaded_documents": [filename],
                },
            )
        )
    if not analyses:
        raise HTTPException(status_code=400, detail=f"CSV file '{filename}' did not contain any usable candidate rows.")
    return analyses


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat(), "origins": settings.allowed_origins}


@app.post("/api/v1/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest) -> AuthResponse:
    user = USERS.get(payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(subject=user.id, role=user.role, organization_id=user.organization_id)
    return AuthResponse(access_token=token, user=serialize_user(payload.email))


@app.get("/api/v1/auth/me", response_model=UserResponse)
async def me(user: Annotated[dict, Depends(get_current_user)]) -> UserResponse:
    return get_user_by_id(user["sub"])


@app.get("/api/v1/job-roles", response_model=JobRoleCatalogResponse)
async def job_roles(user: Annotated[dict, Depends(get_current_user)]) -> JobRoleCatalogResponse:
    require_role("admin", "hr")(user)
    roles = load_job_roles()
    items = [
        JobRoleCatalogItem(
            role=role,
            required_skills=payload.get("required_skills", []),
            preferred_skills=payload.get("preferred_skills", []),
            preferred_qualifications=payload.get("preferred_qualifications", []),
        )
        for role, payload in roles.items()
    ]
    return JobRoleCatalogResponse(items=items)


@app.get("/api/v1/team-members", response_model=TeamListResponse)
async def team_members(user: Annotated[dict, Depends(get_current_user)]) -> TeamListResponse:
    require_role("admin")(user)
    return TeamListResponse(items=[serialize_user(email) for email in USERS])


@app.get("/api/v1/activity", response_model=ActivityListResponse)
async def activity(user: Annotated[dict, Depends(get_current_user)]) -> ActivityListResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    return ActivityListResponse(items=[ActivityItem(**item) for item in state["activities"][:20]])


@app.get("/api/v1/dashboard/overview", response_model=DashboardMetricsResponse)
async def overview(user: Annotated[dict, Depends(get_current_user)]) -> DashboardMetricsResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    analyses = list(state["analyses"].values())
    shortlisted = sum(1 for item in analyses if item["recommendation"] == "Shortlist")
    consider = sum(1 for item in analyses if item["recommendation"] == "Consider")
    rejected = sum(1 for item in analyses if item["recommendation"] == "Reject")
    average_score = round(sum(item["score"]["total"] for item in analyses) / max(1, len(analyses)), 2)
    return DashboardMetricsResponse(
        total_candidates=len(state["candidates"]),
        shortlisted=shortlisted,
        consider=consider,
        rejected=rejected,
        total_jobs=len(state["jobs"]),
        average_score=average_score,
        average_skill_match=round(sum(item["score"]["skill_match"] for item in analyses) / max(1, len(analyses)), 2),
        average_experience_fit=round(sum(item["score"]["experience"] for item in analyses) / max(1, len(analyses)), 2),
    )


@app.post("/api/v1/jobs", response_model=JobResponse)
async def create_job(payload: JobCreateRequest, user: Annotated[dict, Depends(get_current_user)]) -> JobResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    profile = get_role_profile(payload.job_role)
    required_skills = payload.required_skills or profile.get("required_skills", [])
    preferred_skills = payload.preferred_skills or profile.get("preferred_skills", [])
    job = JobResponse(
        id=str(uuid4()),
        title=payload.title,
        department=payload.department,
        job_role=payload.job_role,
        description=payload.description,
        required_skills=required_skills,
        preferred_skills=preferred_skills,
        min_experience_years=payload.min_experience_years,
        status="active",
        created_at=now_iso(),
    )
    state["jobs"][job.id] = job.model_dump()
    append_activity(state, get_user_by_id(user["sub"]).full_name, f"created job '{job.title}'")
    save_store(state)
    return job


@app.get("/api/v1/jobs", response_model=JobListResponse)
async def list_jobs(user: Annotated[dict, Depends(get_current_user)]) -> JobListResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    jobs = [JobResponse(**item) for item in state["jobs"].values()]
    jobs.sort(key=lambda item: item.created_at, reverse=True)
    return JobListResponse(items=jobs)


@app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: Annotated[dict, Depends(get_current_user)]) -> JobResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    return JobResponse(**require_job(state, job_id))


@app.get("/api/v1/jobs/{job_id}/candidates", response_model=CandidateListResponse)
async def list_job_candidates(
    job_id: str,
    user: Annotated[dict, Depends(get_current_user)],
    search: str | None = None,
    recommendation: str | None = None,
    min_score: float | None = None,
) -> CandidateListResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    require_job(state, job_id)
    items: list[CandidateSummary] = []
    for candidate in state["candidates"].values():
        if candidate["job_id"] != job_id:
            continue
        analysis = state["analyses"].get(candidate.get("analysis_id"), {})
        items.append(candidate_summary_from_record(candidate, analysis))
    items = filter_candidates(items, search=search, recommendation=recommendation, min_score=min_score)
    items.sort(key=lambda item: item.score, reverse=True)
    return CandidateListResponse(items=items)


@app.post("/api/v1/candidates/upload", response_model=CandidateUploadResponse)
async def upload_candidates(
    job_id: str = Query(...),
    files: List[UploadFile] = File(...),
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> CandidateUploadResponse:
    require_role("admin", "hr")(user)
    if not files:
        raise HTTPException(status_code=400, detail="Please upload at least one CSV or PDF file.")
    state = load_store()
    job_dict = require_job(state, job_id)
    job = JobResponse(**job_dict)
    actor = get_user_by_id(user["sub"]).full_name

    created_ids: list[str] = []
    analyses: list[AnalysisResponse] = []

    for upload in files:
        if not allowed_upload(upload.filename):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file '{upload.filename}'. Only CSV, PDF, DOCX, and TXT are supported.",
            )
        raw = await upload.read()
        if upload.filename.lower().endswith(".csv"):
            csv_analyses = process_csv_upload(state, job, upload.filename, raw)
            analyses.extend(csv_analyses)
            created_ids.extend(analysis.candidate_id for analysis in csv_analyses)
            continue

        parsed = parse_resume_document(upload.filename, raw)
        candidate_id = str(uuid4())
        state["candidates"][candidate_id] = {
            "id": candidate_id,
            "job_id": job_id,
            "name": parsed["name"],
            "email": parsed["email"],
            "phone": parsed.get("phone"),
            "linkedin": None,
            "github": None,
            "filename": upload.filename,
            "created_at": now_iso(),
            "resume_text": parsed["resume_text"],
            "resume_excerpt": parsed["resume_text"][:400],
            "extracted_skills": parsed["skills"],
            "experience_years": parsed["experience_years"],
            "education": parsed["education"],
            "projects": parsed["projects"],
            "certifications": parsed["certifications"],
            "schooling_10": "",
            "schooling_12": "",
            "uploaded_documents": [upload.filename],
            "status": "Uploaded",
            "analysis_id": None,
        }
        created_ids.append(candidate_id)

    append_activity(state, actor, f"uploaded {len(created_ids)} resume(s) for '{job.title}'")
    save_store(state)
    for analysis in analyses:
        await broadcast(
            {
                "type": "candidate.scored",
                "jobId": job_id,
                "candidateId": analysis.candidate_id,
                "analysisId": analysis.id,
                "score": analysis.score.total,
                "recommendation": analysis.recommendation,
            }
        )

    return CandidateUploadResponse(
        job_id=job_id,
        uploaded=len(created_ids),
        candidate_ids=created_ids,
        message="Files uploaded successfully. CSV datasets were analyzed immediately; PDF resumes are ready for HR review and manual analysis.",
        analyses=analyses,
    )


@app.post("/api/v1/candidates/intake", response_model=CandidateIntakeResponse)
async def intake_candidate(
    job_id: str = Query(...),
    name: str = Query(...),
    email: str | None = Query(None),
    phone: str | None = Query(None),
    linkedin: str | None = Query(None),
    github: str | None = Query(None),
    experience_years: float = Query(0),
    education: str = Query("Not specified"),
    schooling_10: str = Query(""),
    schooling_12: str = Query(""),
    skills: str = Query(""),
    projects: str = Query(""),
    certifications: str = Query(""),
    summary: str = Query(""),
    files: List[UploadFile] = File(...),
    user: Annotated[dict, Depends(get_current_user)] = None,
) -> CandidateIntakeResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    require_job(state, job_id)
    uploaded_documents: list[str] = []
    resume_text_parts = [summary]
    parsed_skills = [item.strip() for item in skills.split(",") if item.strip()]
    parsed_projects = [item.strip() for item in projects.split("|") if item.strip()]
    parsed_certifications = [item.strip() for item in certifications.split(",") if item.strip()]

    for upload in files:
        if not allowed_upload(upload.filename):
            raise HTTPException(status_code=400, detail=f"Unsupported file '{upload.filename}'. Only CSV, PDF, DOCX, and TXT are supported.")
        raw = await upload.read()
        if upload.filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Candidate intake form accepts resume/marksheet documents, not CSV datasets.")
        parsed = parse_resume_document(upload.filename, raw)
        uploaded_documents.append(upload.filename)
        if upload.filename.lower().endswith(".pdf"):
            resume_text_parts.append(parsed["resume_text"])
        parsed_skills = list(dict.fromkeys([*parsed_skills, *parsed["skills"]]))
        parsed_projects = list(dict.fromkeys([*parsed_projects, *parsed["projects"]]))
        parsed_certifications = list(dict.fromkeys([*parsed_certifications, *parsed["certifications"]]))
        if not email and parsed.get("email"):
            email = parsed["email"]
        if not phone and parsed.get("phone"):
            phone = parsed["phone"]
        if education == "Not specified" and parsed.get("education"):
            education = parsed["education"]
        if not experience_years and parsed.get("experience_years"):
            experience_years = parsed["experience_years"]

    candidate_id = str(uuid4())
    resume_text = normalize_text(" ".join(part for part in resume_text_parts if part))
    state["candidates"][candidate_id] = {
        "id": candidate_id,
        "job_id": job_id,
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin": linkedin,
        "github": github,
        "filename": uploaded_documents[0] if uploaded_documents else f"{name}-profile",
        "created_at": now_iso(),
        "resume_text": resume_text,
        "resume_excerpt": resume_text[:400],
        "extracted_skills": parsed_skills,
        "experience_years": experience_years,
        "education": education,
        "projects": parsed_projects,
        "certifications": parsed_certifications,
        "schooling_10": schooling_10,
        "schooling_12": schooling_12,
        "uploaded_documents": uploaded_documents,
        "status": "Uploaded",
        "analysis_id": None,
    }
    append_activity(state, get_user_by_id(user["sub"]).full_name, f"uploaded candidate profile for '{name}'")
    save_store(state)
    return CandidateIntakeResponse(candidate_id=candidate_id, job_id=job_id, status="Uploaded", message="Candidate profile saved. Click Analyze when ready.")


@app.get("/api/v1/candidates", response_model=CandidateListResponse)
async def list_candidates(user: Annotated[dict, Depends(get_current_user)]) -> CandidateListResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    items = [candidate_summary_from_record(candidate, state["analyses"].get(candidate.get("analysis_id"), {})) for candidate in state["candidates"].values()]
    items.sort(key=lambda item: item.score, reverse=True)
    return CandidateListResponse(items=items)


@app.get("/api/v1/candidates/search", response_model=CandidateListResponse)
async def search_candidates(
    user: Annotated[dict, Depends(get_current_user)],
    search: str | None = None,
    recommendation: str | None = None,
    min_score: float | None = None,
) -> CandidateListResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    items = [
        candidate_summary_from_record(candidate, state["analyses"].get(candidate.get("analysis_id"), {}))
        for candidate in state["candidates"].values()
    ]
    items = filter_candidates(items, search=search, recommendation=recommendation, min_score=min_score)
    items.sort(key=lambda item: item.score, reverse=True)
    return CandidateListResponse(items=items)


@app.get("/api/v1/candidates/{candidate_id}", response_model=CandidateDetailResponse)
async def get_candidate(candidate_id: str, user: Annotated[dict, Depends(get_current_user)]) -> CandidateDetailResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    candidate = require_candidate(state, candidate_id)
    analysis = state["analyses"].get(candidate.get("analysis_id"), {})
    if not analysis:
        return CandidateDetailResponse(
            **candidate_summary_from_record(candidate, analysis).model_dump(),
            pros=[],
            cons=[],
            strengths=[],
            weaknesses=[],
            explanation="This candidate has been uploaded but not analyzed yet.",
            extracted_skills=candidate["extracted_skills"],
            experience_years=candidate["experience_years"],
            education=candidate["education"],
            resume_excerpt=candidate["resume_excerpt"],
            resume_text=candidate["resume_text"],
            interview_questions=[],
            improvement_suggestions=[],
            bias_flags=[],
            projects=candidate.get("projects", []),
            certifications=candidate.get("certifications", []),
            missing_skills=[],
            schooling_10=candidate.get("schooling_10", ""),
            schooling_12=candidate.get("schooling_12", ""),
            uploaded_documents=candidate.get("uploaded_documents", []),
        )
    return CandidateDetailResponse(
        **candidate_summary_from_record(candidate, analysis).model_dump(),
        pros=analysis["pros"],
        cons=analysis["cons"],
        strengths=analysis["strengths"],
        weaknesses=analysis["weaknesses"],
        explanation=analysis["explanation"],
        extracted_skills=candidate["extracted_skills"],
        experience_years=candidate["experience_years"],
        education=candidate["education"],
        resume_excerpt=candidate["resume_excerpt"],
        resume_text=candidate["resume_text"],
        interview_questions=analysis.get("interview_questions", []),
        improvement_suggestions=analysis.get("improvement_suggestions", []),
        bias_flags=analysis.get("bias_flags", []),
        projects=candidate.get("projects", []),
        certifications=candidate.get("certifications", []),
        missing_skills=analysis.get("missing_skills", []),
        schooling_10=candidate.get("schooling_10", ""),
        schooling_12=candidate.get("schooling_12", ""),
        uploaded_documents=candidate.get("uploaded_documents", []),
    )


@app.post("/api/v1/candidates/{candidate_id}/analyze", response_model=AnalysisResponse)
async def analyze_uploaded_candidate(candidate_id: str, user: Annotated[dict, Depends(get_current_user)]) -> AnalysisResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    candidate = require_candidate(state, candidate_id)
    job = JobResponse(**require_job(state, candidate["job_id"]))
    analysis = create_candidate_analysis(
        state,
        job,
        filename=candidate["filename"],
        name=candidate["name"],
        email=candidate.get("email"),
        resume_text=candidate.get("resume_text", ""),
        experience_years=candidate.get("experience_years", 0.0),
        education=candidate.get("education", "Not specified"),
        skills=candidate.get("extracted_skills", []),
        projects=candidate.get("projects", []),
        certifications=candidate.get("certifications", []),
        candidate_id=candidate_id,
        metadata={
            "phone": candidate.get("phone"),
            "linkedin": candidate.get("linkedin"),
            "github": candidate.get("github"),
            "schooling_10": candidate.get("schooling_10", ""),
            "schooling_12": candidate.get("schooling_12", ""),
            "uploaded_documents": candidate.get("uploaded_documents", []),
        },
    )
    append_activity(state, get_user_by_id(user["sub"]).full_name, f"analyzed candidate '{candidate['name']}'")
    save_store(state)
    await broadcast(
        {
            "type": "candidate.scored",
            "jobId": candidate["job_id"],
            "candidateId": candidate_id,
            "analysisId": analysis.id,
            "score": analysis.score.total,
            "recommendation": analysis.recommendation,
        }
    )
    return analysis


@app.get("/api/v1/jobs/{job_id}/leaderboard", response_model=CandidateListResponse)
async def leaderboard(job_id: str, user: Annotated[dict, Depends(get_current_user)]) -> CandidateListResponse:
    return await list_job_candidates(job_id, user)


@app.get("/api/v1/candidates/{candidate_id}/interview-questions", response_model=InterviewQuestionsResponse)
async def interview_questions(
    candidate_id: str,
    user: Annotated[dict, Depends(get_current_user)],
) -> InterviewQuestionsResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    candidate = require_candidate(state, candidate_id)
    analysis = state["analyses"][candidate["analysis_id"]]
    return InterviewQuestionsResponse(candidate_id=candidate_id, questions=analysis.get("interview_questions", []))


@app.get("/api/v1/analytics/jobs", response_model=JobAnalyticsResponse)
async def analytics_by_job(user: Annotated[dict, Depends(get_current_user)]) -> JobAnalyticsResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    points: list[JobAnalyticsPoint] = []
    for job in state["jobs"].values():
        candidates = [candidate for candidate in state["candidates"].values() if candidate["job_id"] == job["id"]]
        analyses = [state["analyses"][candidate["analysis_id"]] for candidate in candidates]
        average = round(sum(item["score"]["total"] for item in analyses) / max(1, len(analyses)), 2)
        points.append(JobAnalyticsPoint(label=job["title"], candidates=len(candidates), average_score=average))
    points.sort(key=lambda item: item.candidates, reverse=True)
    return JobAnalyticsResponse(items=points)


@app.get("/api/v1/exports/candidates")
async def export_candidates(
    user: Annotated[dict, Depends(get_current_user)],
    job_id: str | None = None,
) -> StreamingResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "candidate_id",
            "name",
            "email",
            "job_id",
            "filename",
            "score",
            "skill_match",
            "experience",
            "semantic_similarity",
            "recommendation",
        ]
    )
    for candidate in state["candidates"].values():
        if job_id and candidate["job_id"] != job_id:
            continue
        analysis = state["analyses"][candidate["analysis_id"]]
        writer.writerow(
            [
                candidate["id"],
                candidate["name"],
                candidate.get("email", ""),
                candidate["job_id"],
                candidate["filename"],
                analysis["score"]["total"],
                analysis["score"]["skill_match"],
                analysis["score"]["experience"],
                analysis["score"]["semantic_similarity"],
                analysis["recommendation"],
            ]
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="candidate-export.csv"'},
    )


@app.get("/api/v1/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(analysis_id: str, user: Annotated[dict, Depends(get_current_user)]) -> AnalysisResponse:
    require_role("admin", "hr")(user)
    state = load_store()
    analysis = state["analyses"].get(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return AnalysisResponse(**analysis)


@app.websocket("/ws/organizations/{organization_id}/events")
async def organization_events(websocket: WebSocket, organization_id: str) -> None:
    await websocket.accept()
    SOCKETS.append(websocket)
    await websocket.send_json(
        {"type": "connection.ready", "organizationId": organization_id, "message": "Realtime channel established."}
    )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in SOCKETS:
            SOCKETS.remove(websocket)


async def broadcast(message: dict) -> None:
    disconnected: List[WebSocket] = []
    for socket in SOCKETS:
        try:
            await socket.send_json(message)
        except RuntimeError:
            disconnected.append(socket)
    for socket in disconnected:
        if socket in SOCKETS:
            SOCKETS.remove(socket)
