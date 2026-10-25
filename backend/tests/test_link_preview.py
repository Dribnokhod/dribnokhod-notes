import unittest
from unittest.mock import patch

import requests
from app import main


class LinkPreviewTests(unittest.TestCase):
    def test_russian_metadata_encodings(self):
        for encoding, header, meta in [
            ("utf-8", "text/html", ""),
            ("utf-8", "text/html", '<meta charset="utf-8">'),
            ("windows-1251", "text/html", '<meta charset="windows-1251">'),
            ("windows-1251", "text/html; charset=windows-1251", ""),
        ]:
            with self.subTest(encoding=encoding, header=header, meta=meta):
                response = requests.Response()
                response.status_code = 200
                response.headers["Content-Type"] = header
                response.encoding = requests.utils.get_encoding_from_headers(
                    response.headers
                )
                response._content = (
                    f"<html><head>{meta}<title>Русский заголовок</title>"
                    '<meta name="description" content="Пояснение на русском">'
                    "</head></html>"
                ).encode(encoding)
                with patch.object(main.requests, "get", return_value=response):
                    result = (
                        main.app.test_client()
                        .get("/api/link-preview?url=https://example.com")
                        .get_json()
                    )
                self.assertEqual(result["title"], "Русский заголовок")
                self.assertEqual(result["description"], "Пояснение на русском")
