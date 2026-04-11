from typing import Iterable, Sequence


def overlap_ratio(left: Sequence[str], right: Sequence[str]) -> float:
    if not left:
        return 0.0
    left_set = {item.strip().lower() for item in left}
    right_set = {item.strip().lower() for item in right}
    return len(left_set & right_set) / len(left_set)


def normalize(value: float) -> float:
    return max(0.0, min(100.0, round(value, 2)))


def calculate_score(
    required_skills: Sequence[str],
    preferred_skills: Sequence[str],
    candidate_skills: Sequence[str],
    candidate_experience_years: float,
    min_experience_years: float,
    education_fit: float,
    additional_signal: float,
    semantic_similarity: float,
) -> dict:
    required_match = overlap_ratio(required_skills, candidate_skills) * 100
    preferred_match = overlap_ratio(preferred_skills, candidate_skills) * 100 if preferred_skills else required_match
    skill_match = normalize(required_match * 0.8 + preferred_match * 0.2)

    if min_experience_years <= 0:
        experience = 100.0
    else:
        experience = normalize((candidate_experience_years / min_experience_years) * 100)

    total = normalize(
        skill_match * 0.40
        + experience * 0.30
        + education_fit * 0.15
        + additional_signal * 0.15
    )

    return {
        "skill_match": skill_match,
        "experience": experience,
        "education": normalize(education_fit),
        "additional": normalize(additional_signal),
        "semantic_similarity": normalize(semantic_similarity),
        "total": total,
    }


def recommendation_for_score(score: float) -> str:
    if score >= 85:
        return "Shortlist"
    if score >= 65:
        return "Consider"
    return "Reject"
