import unittest

from app.services.scoring import calculate_score, recommendation_for_score


class ScoringTests(unittest.TestCase):
    def test_weighted_score_is_bounded(self) -> None:
        score = calculate_score(
            required_skills=["Python", "FastAPI", "Docker"],
            preferred_skills=["NLP"],
            candidate_skills=["Python", "FastAPI", "Docker", "PostgreSQL"],
            candidate_experience_years=5,
            min_experience_years=4,
            education_fit=82,
            additional_signal=90,
            semantic_similarity=87,
        )
        self.assertGreaterEqual(score["total"], 0)
        self.assertLessEqual(score["total"], 100)

    def test_recommendation_bands(self) -> None:
        self.assertEqual(recommendation_for_score(91), "Shortlist")
        self.assertEqual(recommendation_for_score(70), "Consider")
        self.assertEqual(recommendation_for_score(40), "Reject")


if __name__ == "__main__":
    unittest.main()
