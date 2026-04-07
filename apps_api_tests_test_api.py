import os
import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.store import STORE_PATH, initial_state, save_store


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        save_store(initial_state())
        self.client = TestClient(app)
        login = self.client.post(
            "/api/v1/auth/login",
            json={"email": "hr@hiresight.ai", "password": "Hr@12345"},
        )
        self.assertEqual(login.status_code, 200)
        self.token = login.json()["access_token"]
        job = self.client.post(
            "/api/v1/jobs",
            json={
                "title": "Senior Backend Engineer",
                "department": "Engineering",
                "description": "Need Python FastAPI PostgreSQL Docker experience.",
                "required_skills": ["Python", "FastAPI", "PostgreSQL"],
                "preferred_skills": ["Docker", "NLP"],
                "min_experience_years": 4,
            },
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(job.status_code, 200)
        self.job_id = job.json()["id"]

    def test_health_endpoint(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_upload_and_fetch_candidate(self) -> None:
        resume_text = (
            "Nina Rao\nnina@example.com\n5 years experience\n"
            "Skills: Python, FastAPI, PostgreSQL, Docker, NLP\n"
            "Education: B.Tech Computer Science\n"
            "Built APIs and reduced latency by 32%.\n"
        )
        upload = self.client.post(
            f"/api/v1/candidates/upload?job_id={self.job_id}",
            files={"files": ("nina.txt", resume_text.encode("utf-8"), "text/plain")},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(upload.status_code, 200)
        payload = upload.json()
        self.assertEqual(payload["uploaded"], 1)
        candidate_id = payload["candidate_ids"][0]

        candidates = self.client.get(
            "/api/v1/candidates",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(candidates.status_code, 200)
        self.assertEqual(len(candidates.json()["items"]), 1)

        detail = self.client.get(
            f"/api/v1/candidates/{candidate_id}",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["name"], "Nina Rao")
        self.assertEqual(detail.json()["recommendation"], "Pending")

        analyze = self.client.post(
            f"/api/v1/candidates/{candidate_id}/analyze",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(analyze.status_code, 200)
        self.assertIn(analyze.json()["recommendation"], {"Shortlist", "Consider", "Reject"})

        analytics = self.client.get(
            "/api/v1/analytics/jobs",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(analytics.status_code, 200)
        self.assertEqual(len(analytics.json()["items"]), 1)

        export = self.client.get(
            f"/api/v1/exports/candidates?job_id={self.job_id}",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(export.status_code, 200)
        self.assertIn("candidate_id", export.text)

        csv_upload = self.client.post(
            f"/api/v1/candidates/upload?job_id={self.job_id}",
            files={
                "files": (
                    "bulk.csv",
                    (
                        "name,email,skills,experience_years,education,resume_text\n"
                        "Riya Sharma,riya@example.com,\"Python, FastAPI, NLP\",6,Master of Technology,"
                        "\"Built NLP workflows and semantic ranking systems.\""
                    ).encode("utf-8"),
                    "text/csv",
                )
            },
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(csv_upload.status_code, 200)
        self.assertEqual(csv_upload.json()["uploaded"], 1)

    def test_protected_endpoint_requires_token(self) -> None:
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
