"""
Integration Tests for Proxy FastAPI Endpoints (tests/test_proxy_endpoints.py)
Tests HTTP routing, CORS headers, budget deduction, fixture replay, and error codes.
"""

import os
import pytest
from fastapi.testclient import TestClient

import proxy.main as proxy_main
from proxy.main import app, budget_guard
from proxy.speech.adapter import FixtureGnaniAdapter
from proxy.speech.wav_util import wav_from_pcm


FIXTURES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "proxy", "fixtures"))


@pytest.fixture
def client(monkeypatch):
    # Guarantee isolated deterministic fixture replay regardless of local .env settings
    budget_guard.reset()
    monkeypatch.setattr(proxy_main, "GNANI_MODE", "fixture")
    monkeypatch.setattr(proxy_main, "speech_adapter", FixtureGnaniAdapter(fixtures_dir=FIXTURES_DIR))
    return TestClient(app)


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["service"] == "jaanch-proxy"
    assert "mode" in data


def test_budget_endpoint(client):
    response = client.get("/budget")
    assert response.status_code == 200
    data = response.json()
    assert data["cap"] == 4500.0
    assert data["used"] == 0.0
    assert data["remaining"] == 4500.0


def test_tts_endpoint(client):
    req_body = {
        "text": "सही है",
        "voice": "Shivani",
        "speed": 1.0
    }
    response = client.post("/tts", json=req_body)
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    audio_content = response.content
    assert audio_content[:4] == b"RIFF"
    assert audio_content[8:12] == b"WAVE"


def test_stt_fixture_replay(client):
    # 1 second of 16kHz mono audio
    pcm = b"\x01\x02" * 16000
    wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)

    os.environ["MOCK_FIXTURE_KEY"] = "sahi_hai"
    try:
        response = client.post(
            "/stt",
            files={"audio_file": ("test.wav", wav, "audio/wav")},
            data={"language_code": "hi-IN"},
            headers={"X-Session-ID": "session_test_1"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["transcript"] == "सही है"
        assert data["confidence"] >= 0.95
    finally:
        del os.environ["MOCK_FIXTURE_KEY"]


def test_stt_oversize_audio_rejected(client):
    # 26 seconds of audio
    pcm = b"\x00" * (26 * 32000)
    oversize_wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)

    response = client.post(
        "/stt",
        files={"audio_file": ("oversize.wav", oversize_wav, "audio/wav")},
        data={"language_code": "hi-IN"}
    )
    assert response.status_code == 400
    assert "exceeds maximum allowed" in response.json()["detail"]
    # Oversize/invalid WAV must be rejected before deducting credits
    assert budget_guard.get_status()["used"] == 0.0


def test_cors_localhost_and_extension_origin(client):
    res_local = client.get("/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert res_local.status_code == 200
    assert res_local.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"

    res_ext = client.get("/health", headers={"Origin": "chrome-extension://abcdefghijklmnop"})
    assert res_ext.status_code == 200
    assert res_ext.headers.get("access-control-allow-origin") == "chrome-extension://abcdefghijklmnop"


def test_session_budget_cap_enforcement(client):
    # Set tight cap for test
    budget_guard.per_session_cap = 3
    pcm = b"\x01\x02" * 16000
    wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)

    os.environ["MOCK_FIXTURE_KEY"] = "haan"
    try:
        # 3 allowed requests
        for _ in range(3):
            res = client.post(
                "/stt",
                files={"audio_file": ("test.wav", wav, "audio/wav")},
                headers={"X-Session-ID": "session_capped"}
            )
            assert res.status_code == 200

        # 4th request must fail with 402 Payment Required / Quota Exceeded
        res4 = client.post(
            "/stt",
            files={"audio_file": ("test.wav", wav, "audio/wav")},
            headers={"X-Session-ID": "session_capped"}
        )
        assert res4.status_code == 402
        assert "Session quota exceeded" in res4.json()["detail"]
    finally:
        del os.environ["MOCK_FIXTURE_KEY"]
        budget_guard.per_session_cap = 40
