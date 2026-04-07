import unittest

from app.auth import create_access_token, decode_access_token, hash_password, verify_password


class AuthTests(unittest.TestCase):
    def test_password_hash_roundtrip(self) -> None:
        password_hash = hash_password("Admin@123")
        self.assertTrue(verify_password("Admin@123", password_hash))
        self.assertFalse(verify_password("wrong-pass", password_hash))

    def test_access_token_contains_claims(self) -> None:
        token = create_access_token(subject="user-1", role="admin", organization_id="org-demo")
        payload = decode_access_token(token)
        self.assertEqual(payload["sub"], "user-1")
        self.assertEqual(payload["role"], "admin")
        self.assertEqual(payload["organization_id"], "org-demo")


if __name__ == "__main__":
    unittest.main()
