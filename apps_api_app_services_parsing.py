import io
import re
from pathlib import Path

from docx import Document
from pypdf import PdfReader


KNOWN_SKILLS = {
    "python",
    "fastapi",
    "django",
    "flask",
    "react",
    "next.js",
    "nextjs",
    "typescript",
    "javascript",
    "node.js",
    "nodejs",
    "postgresql",
    "mysql",
    "mongodb",
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "gcp",
    "nlp",
    "machine learning",
    "data analysis",
    "java",
    "spring boot",
    "html",
    "css",
    "tailwind",
    "rest api",
    "graphql",
    "git",
    "statistics",
    "data structures",
    "algorithms",
    "system design",
    "sql",
    "seo",
    "content strategy",
    "campaign management",
    "analytics",
    "product strategy",
    "stakeholder management",
    "user research",
    "a/b testing",
}

EDUCATION_HINTS = ["phd", "master", "m.tech", "mba", "b.tech", "bachelor", "b.sc", "bca", "mca"]
CERTIFICATION_HINTS = ["certified", "certification", "aws certified", "google analytics", "scrum", "pmp"]
SECTION_HEADERS = ["projects", "project", "experience", "certifications", "education", "skills"]


def extract_text_from_upload(filename: str, payload: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(payload))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    if suffix == ".docx":
        document = Document(io.BytesIO(payload))
        return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()
    return payload.decode("utf-8", errors="ignore").strip()


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_email(text: str) -> str | None:
    match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", text)
    if match:
        return match.group(0)

    compact = text.replace(" ", "")
    repaired = re.search(r"[\w\.-]+@(?:gmail|yahoo|outlook|hotmail)(?:\.|)com", compact, re.IGNORECASE)
    if repaired:
        value = repaired.group(0)
        for domain in ["gmailcom", "yahoocom", "outlookcom", "hotmailcom"]:
            if value.lower().endswith(domain):
                return f"{value[:-3]}.com"
        return value
    return None


def extract_name(text: str, fallback: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if lines:
        first_line = lines[0]
        if len(first_line.split()) <= 5 and "@" not in first_line:
            return first_line
    return fallback


def extract_phone(text: str) -> str | None:
    match = re.search(r"(?:\+91[\s\-]?)?[6-9]\d{9}", text.replace(" ", ""))
    return match.group(0) if match else None


def extract_experience_years(text: str) -> float:
    patterns = [
        r"(\d+(?:\.\d+)?)\+?\s+years?",
        r"experience\s*[:\-]?\s*(\d+(?:\.\d+)?)",
    ]
    lowered = text.lower()
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            return float(match.group(1))
    return 0.0


def extract_education(text: str) -> str:
    lowered = text.lower()
    for hint in EDUCATION_HINTS:
        if hint in lowered:
            return hint.upper()
    return "Not specified"


def extract_skills(text: str) -> list[str]:
    lowered = text.lower()
    skills = []
    for skill in KNOWN_SKILLS:
        if skill in lowered:
            label = skill.replace("nextjs", "Next.js").replace("nodejs", "Node.js").title()
            skills.append(label)
    return sorted(set(skills))


def extract_profile_summary(text: str) -> str:
    summary_lines = extract_section_lines(text, ["profile summary", "summary", "professional summary"])
    if summary_lines:
        return " ".join(summary_lines)[:500]
    return ""


def extract_section_lines(text: str, section_names: list[str]) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    collected: list[str] = []
    capture = False
    for line in lines:
        lowered = line.lower().rstrip(":")
        if lowered in section_names:
            capture = True
            continue
        if capture and lowered in SECTION_HEADERS:
            break
        if capture:
            collected.append(line.lstrip("-• ").strip())
    return collected[:5]


def extract_projects(text: str) -> list[str]:
    projects = extract_section_lines(text, ["projects", "project"])
    if projects:
        return projects
    fallback = []
    for sentence in re.split(r"[.\n]", text):
        lowered = sentence.lower()
        if any(token in lowered for token in ["built", "developed", "designed", "implemented", "shipped"]):
            cleaned = sentence.strip(" -•")
            if cleaned:
                fallback.append(cleaned)
    return fallback[:4]


def extract_certifications(text: str) -> list[str]:
    certifications = extract_section_lines(text, ["certifications", "certification"])
    if certifications:
        return certifications
    lowered = text.lower()
    found = [hint.title() for hint in CERTIFICATION_HINTS if hint in lowered]
    return sorted(set(found))[:4]


def parse_resume_document(filename: str, payload: bytes) -> dict:
    raw_text = extract_text_from_upload(filename, payload)
    normalized = normalize_text(raw_text)
    return {
        "raw_text": raw_text,
        "resume_text": normalized,
        "name": extract_name(raw_text, Path(filename).stem),
        "email": extract_email(raw_text),
        "phone": extract_phone(raw_text),
        "skills": extract_skills(raw_text),
        "education": extract_education(raw_text),
        "experience_years": extract_experience_years(raw_text),
        "projects": extract_projects(raw_text),
        "certifications": extract_certifications(raw_text),
        "profile_summary": extract_profile_summary(raw_text),
    }
