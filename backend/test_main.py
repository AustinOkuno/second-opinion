from fastapi.testclient import TestClient
from main import app
import main

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"Hello": "World"}

def test_valid_message():
    response = client.post("/check", json={"text": "You have won a free prize, click here"})
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] in ["safe", "scam", "suspicious"]
    assert body["reason"] != ""

def test_empty_text():
    response = client.post("/check", json={"text": ""})
    assert response.status_code == 422

def test_white_space_text():
    response = client.post("/check", json={"text": "   "})
    assert response.status_code == 422

def test_long_text():
    long_text = "a" * 5001
    response = client.post("/check", json={"text": long_text})
    assert response.status_code == 422

def test_missing_text_field():
    response = client.post("/check", json={})
    assert response.status_code == 422

def test_detector_failure(monkeypatch):
    def broken(txt):
        raise RuntimeError("boom")

    monkeypatch.setattr(main.detector, "detect", broken)