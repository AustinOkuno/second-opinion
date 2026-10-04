import pytest
from fastapi.testclient import TestClient

import main
from main import app, MAX_IMAGE_BYTES

client = TestClient(app)

VALID_VERDICTS = {"likely_scam", "suspicious", "no_red_flags_found", "cannot_tell"}


# Keep tests offline: never call the real AI (free, fast, same result every time).
@pytest.fixture(autouse=True)
def no_ai(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"Hello": "World"}

#valid message test
def test_valid_message():
    response = client.post("/check", json={"text": "You have won a free prize, click here"})
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] in VALID_VERDICTS
    assert body["reason"] != ""

#empty message tests
def test_empty_text():
    response = client.post("/check", json={"text": ""})
    assert response.status_code == 422

#white space text test
def test_white_space_text():
    response = client.post("/check", json={"text": "   "})
    assert response.status_code == 422

#long text test
def test_long_text():
    long_text = "a" * 5001
    response = client.post("/check", json={"text": long_text})
    assert response.status_code == 422

#missing text field test
def test_missing_text_field():
    response = client.post("/check", json={})
    assert response.status_code == 422

#if text detector fails, it should return 503
def test_detector_failure(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("boom")
    monkeypatch.setattr(main.detector, "detect", broken)
    response = client.post("/check", json={"text": "This is a test message"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Please try again later. The detector is currently unavailable."}

#valid image test
def test_valid_image():
    response = client.post(
        "/check-image",
        files={"file": ("shot.png", b"fake image bytes", "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] in VALID_VERDICTS
    assert body["reason"] != ""

#empty image test
def test_empty_image():
    response = client.post(
        "/check-image",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Image file is empty."}

#checks if image is right type
def test_unsupported_image_type():
    response = client.post(
        "/check-image",
        files={"file": ("image.gif", b"fake image bytes", "image/gif")},
    )
    assert response.status_code == 415
    assert response.json() == {"detail": "Unsupported media type: image/gif. Allowed types are: image/jpeg, image/png, image/webp"}

#checks if image is too large
def test_large_image():
    large_image_bytes = b"a" * (MAX_IMAGE_BYTES + 1)  # 5 MB + 1 byte
    response = client.post(
        "/check-image",
        files={"file": ("large.png", large_image_bytes, "image/png")},
    )
    assert response.status_code == 413
    assert response.json() == {"detail": "Image file is too large. Maximum size is 5 MB."}

def test_image_detector_failure(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("boom")
    monkeypatch.setattr(main.detector, "detect_image", broken)
    response = client.post(
        "/check-image",
        files={"file": ("shot.png", b"fake image bytes", "image/png")},
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "Please try again later. The image detector is currently unavailable."}