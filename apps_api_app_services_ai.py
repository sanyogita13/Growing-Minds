from uuid import uuid4

from openai import OpenAI

from ..config import settings
from ..schemas import AnalysisResponse, JobResponse, ScoreBreakdown
from .job_intelligence import get_role_profile
from .scoring import calculate_score, recommendation_for_score


def semantic_similarity_score(job: JobResponse, resume_text: str, candidate_skills: list[str]) -> float:
    job_terms = set(" ".join([job.title, job.description, *job.required_skills, *job.preferred_skills]).lower().split())
    resume_terms = set(resume_text.lower().split())
    overlap = len(job_terms & resume_terms)
    coverage = overlap / max(1, len(job_terms))
    skill_bonus = min(len(candidate_skills) / max(1, len(job.required_skills) or 1), 1.0)
    return round((coverage * 70 + skill_bonus * 30) * 100 / 100, 2)


def education_fit_score(job: JobResponse, education: str) -> float:
    if not education or education == "Not specified":
        return 40.0
    lowered = education.lower()
    if any(term in lowered for term in ["master", "m.tech", "mba", "phd"]):
        return 90.0
    if any(term in lowered for term in ["b.tech", "bachelor", "b.sc", "bca"]):
        return 80.0
    return 65.0


def additional_signal_score(resume_text: str) -> float:
    lowered = resume_text.lower()
    quantified = sum(1 for token in ["%", "improved", "reduced", "built", "led", "shipped"] if token in lowered)
    return min(55.0 + quantified * 8.0, 95.0)


def scoring_weights_for_job(job: JobResponse) -> dict:
    profile = get_role_profile(getattr(job, "job_role", ""))
    return profile.get(
        "scoring_weights",
        {
            "skill_match": 40,
            "experience": 30,
            "education": 15,
            "additional": 15,
        },
    )


def pros_and_cons(job: JobResponse, skills: list[str], experience_years: float, education: str) -> tuple[list[str], list[str]]:
    pros: list[str] = []
    cons: list[str] = []

    matches = {skill.lower() for skill in skills}
    required = [skill for skill in job.required_skills if skill.lower() in matches]
    missing = [skill for skill in job.required_skills if skill.lower() not in matches]

    if required:
        pros.append(f"Matched {len(required)} required skill(s): {', '.join(required[:4])}.")
    if experience_years >= job.min_experience_years:
        pros.append(f"Experience meets the target with {experience_years:.1f} years.")
    if education != "Not specified":
        pros.append(f"Education identified as {education}.")

    if missing:
        cons.append(f"Missing some required skills: {', '.join(missing[:4])}.")
    if experience_years < job.min_experience_years:
        cons.append(
            f"Experience is below the requested minimum ({experience_years:.1f} vs {job.min_experience_years:.1f} years)."
        )
    if education == "Not specified":
        cons.append("Education details were not clearly found in the resume.")

    if not cons:
        cons.append("No major gaps detected in the automated screening pass.")
    if not pros:
        pros.append("Resume contains some relevant information but limited structured evidence.")

    return pros[:3], cons[:3]


def missing_skills(job: JobResponse, skills: list[str]) -> list[str]:
    matched = {skill.lower() for skill in skills}
    return [skill for skill in job.required_skills if skill.lower() not in matched][:6]


def improvement_suggestions(job: JobResponse, skills: list[str], experience_years: float, education: str) -> list[str]:
    suggestions: list[str] = []
    matched = {skill.lower() for skill in skills}
    for skill in job.required_skills:
        if skill.lower() not in matched:
            suggestions.append(f"Add or strengthen evidence for {skill}.")
    if experience_years < job.min_experience_years:
        suggestions.append("Highlight longer project ownership, role duration, or leadership outcomes.")
    if education == "Not specified":
        suggestions.append("Include education details clearly in the resume header or summary.")
    if not suggestions:
        suggestions.append("Add quantified achievements to make impact even clearer.")
    return suggestions[:4]


def bias_flags(resume_text: str) -> list[str]:
    lowered = resume_text.lower()
    flags = []
    for token in ["date of birth", "marital status", "religion", "gender", "nationality"]:
        if token in lowered:
            flags.append(f"Protected-attribute-like field detected: {token}.")
    return flags


def default_interview_questions(job: JobResponse, resume: dict, suggestions: list[str]) -> list[str]:
    questions = [
        f"Describe a project where you used {job.required_skills[0] if job.required_skills else 'your core skill'} in production.",
        f"How have you demonstrated {job.title.lower()}-level ownership in your recent work?",
        "Which achievement in your resume had the biggest measurable business impact?",
    ]
    if suggestions:
        questions.append(f"Can you clarify this area from your resume: {suggestions[0]}")
    return questions[:5]


def maybe_generate_llm_questions(job: JobResponse, resume_text: str, fallback_questions: list[str]) -> list[str]:
    if not settings.openai_api_key:
        return fallback_questions
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_model,
            input=(
                "Generate 5 concise interview questions for the following job and candidate resume. "
                "Focus on skills, ownership, measurable outcomes, and one risk area.\n\n"
                f"Job Title: {job.title}\n"
                f"Job Description: {job.description}\n"
                f"Resume: {resume_text[:4000]}"
            ),
        )
        text = response.output_text
        questions = [line.strip("- ").strip() for line in text.splitlines() if line.strip()]
        return questions[:5] or fallback_questions
    except Exception:
        return fallback_questions


def analyze_candidate_for_job(candidate_id: str, job: JobResponse, resume: dict) -> AnalysisResponse:
    semantic_similarity = semantic_similarity_score(job, resume["resume_text"], resume["skills"])
    education_fit = education_fit_score(job, resume["education"])
    additional_signal = additional_signal_score(resume["resume_text"])
    weights = scoring_weights_for_job(job)

    score_values = calculate_score(
        required_skills=job.required_skills,
        preferred_skills=job.preferred_skills,
        candidate_skills=resume["skills"],
        candidate_experience_years=resume["experience_years"],
        min_experience_years=job.min_experience_years,
        education_fit=education_fit,
        additional_signal=additional_signal,
        semantic_similarity=semantic_similarity,
    )
    score_values["total"] = round(
        score_values["skill_match"] * weights["skill_match"] / 100
        + score_values["experience"] * weights["experience"] / 100
        + score_values["education"] * weights["education"] / 100
        + score_values["additional"] * weights["additional"] / 100,
        2,
    )
    score = ScoreBreakdown(**score_values)
    recommendation = recommendation_for_score(score.total)
    pros, cons = pros_and_cons(job, resume["skills"], resume["experience_years"], resume["education"])
    suggestions = improvement_suggestions(job, resume["skills"], resume["experience_years"], resume["education"])
    flags = bias_flags(resume["resume_text"])
    role_missing_skills = missing_skills(job, resume["skills"])
    interview_questions = maybe_generate_llm_questions(
        job,
        resume["resume_text"],
        default_interview_questions(job, resume, suggestions),
    )

    explanation = (
        f"The candidate scored {score.total}/100 with {score.skill_match}% skill match and "
        f"{score.experience}% experience relevance. The recommendation is {recommendation.lower()} "
        "based on job-skill overlap, years of experience, education signal, and contextual resume evidence."
    )

    analysis = AnalysisResponse(
        id=str(uuid4()),
        candidate_id=candidate_id,
        job_id=job.id,
        score=score,
        pros=pros,
        cons=cons,
        strengths=pros,
        weaknesses=cons,
        recommendation=recommendation,
        explanation=explanation,
    )
    analysis.interview_questions = interview_questions
    analysis.improvement_suggestions = suggestions
    analysis.bias_flags = flags
    analysis.missing_skills = role_missing_skills
    return analysis
