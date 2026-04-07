import unittest

from app.services.parsing import parse_resume_document


class ParsingTests(unittest.TestCase):
    def test_student_resume_style_is_parsed(self) -> None:
        text = """
Sanyogita Sharma
Faridabad | sanyogitasharma004@gmailcom | 8595793402

Profile Summary
I'm a Computer Science undergraduate specializing in Artificial Intelligence and Machine Learning.

Education
2023-2027: B.Tech CSE with specialization in AI and ML

Projects
Resume Builder: A Personal Portfolio Website
AI Powered Smart Interview System

Skills
Programming Languages: Java, JavaScript, Python, C++, HTML
Database Management: MySQL
Core Concepts: Data Structures and Algorithm, Machine Learning, Web Development
"""
        parsed = parse_resume_document("student.txt", text.encode("utf-8"))
        self.assertEqual(parsed["name"], "Sanyogita Sharma")
        self.assertEqual(parsed["email"], "sanyogitasharma004@gmail.com")
        self.assertEqual(parsed["phone"], "8595793402")
        self.assertIn("Python", parsed["skills"])
        self.assertIn("Machine Learning", parsed["skills"])
        self.assertGreaterEqual(len(parsed["projects"]), 2)


if __name__ == "__main__":
    unittest.main()
