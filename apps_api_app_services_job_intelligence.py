import json
from pathlib import Path


JOB_ROLES_PATH = Path(__file__).resolve().parent.parent / "data" / "job_roles.json"


def load_job_roles() -> dict:
    return json.loads(JOB_ROLES_PATH.read_text(encoding="utf-8"))


def get_role_profile(job_role: str | None) -> dict:
    roles = load_job_roles()
    if not job_role:
        return {}
    return roles.get(job_role, {})


def merge_job_requirements(job_role: str | None, required_skills: list[str], preferred_skills: list[str]) -> tuple[list[str], list[str]]:
    profile = get_role_profile(job_role)
    merged_required = list(dict.fromkeys([*required_skills, *profile.get("required_skills", [])]))
    merged_preferred = list(dict.fromkeys([*preferred_skills, *profile.get("preferred_skills", [])]))
    return merged_required, merged_preferred
