#!/usr/bin/env python3
"""
Unit tests for Video2PPT Web Application (app.py)
"""

import os
import unittest
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient
from app import app


class TestWebApp(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_index_page(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Video2PPT", response.text)
        self.assertIn("text/html", response.headers["content-type"])

    def test_convert_invalid_interval(self):
        response = self.client.post(
            "/convert",
            files={"video": ("test.mp4", b"dummy content", "video/mp4")},
            data={"interval": 0},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())

    @patch("app.Video2PPT")
    def test_convert_success_mocked(self, mock_converter_cls):
        def fake_convert(self_instance=None):
            # Write a dummy presentation file to the target path
            output_path = mock_converter_cls.call_args[0][1]
            with open(output_path, "wb") as f:
                f.write(b"dummy pptx content")

        mock_instance = MagicMock()
        mock_instance.convert.side_effect = fake_convert
        mock_converter_cls.return_value = mock_instance

        response = self.client.post(
            "/convert",
            files={"video": ("sample.mp4", b"dummy video bytes", "video/mp4")},
            data={"interval": 5},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        self.assertEqual(response.content, b"dummy pptx content")


if __name__ == '__main__':
    unittest.main()

