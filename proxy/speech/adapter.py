"""
Gnani Speech Adapter (proxy/speech/adapter.py)
Stateless adapter for Gnani Prisma STT and Timbre TTS.
Uses Python standard library (urllib.request) for maximum portability and zero-dependency reliability.
Supports Live, Record, Fixture, and Auto modes.
"""

import sys
import os
import json
import time
import hashlib
import uuid
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

_current_dir = os.path.dirname(os.path.abspath(__file__))
_proxy_dir = os.path.abspath(os.path.join(_current_dir, ".."))
_parent_dir = os.path.abspath(os.path.join(_proxy_dir, ".."))
for _p in (_current_dir, _proxy_dir, _parent_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from proxy.speech.wav_util import wav_from_pcm, validate_stt_audio
except ImportError:
    from speech.wav_util import wav_from_pcm, validate_stt_audio


class SpeechAdapterError(Exception):
    def __init__(self, message: str, status_code: int = 500, code: str = "SPEECH_ERROR"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class FixtureNotFoundError(SpeechAdapterError):
    def __init__(self, message: str = "No fixture found for input audio"):
        super().__init__(message, status_code=404, code="FIXTURE_MISS")


class OutOfCreditsError(SpeechAdapterError):
    def __init__(self, message: str = "Gnani credits depleted. Please switch to sample/fixture mode."):
        super().__init__(message, status_code=402, code="OUT_OF_CREDITS")


def encode_multipart_form(fields: Dict[str, str], files: Dict[str, tuple], boundary: str) -> bytes:
    """Encodes fields and files into multipart/form-data RFC 7578."""
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{value}\r\n".encode("utf-8"))

    for name, (filename, content, content_type) in files.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode("utf-8"))
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(content)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body)


class BaseSpeechAdapter:
    async def stt(self, audio_bytes: bytes, language_code: str = "hi-IN") -> Dict[str, Any]:
        raise NotImplementedError

    async def tts(self, text: str, voice: str = "Shivani", speed: float = 1.0) -> bytes:
        raise NotImplementedError


class LiveGnaniAdapter(BaseSpeechAdapter):
    def __init__(self, api_key: str, base_url: str = "https://api.vachana.ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def _headers(self) -> Dict[str, str]:
        return {"X-API-Key-ID": self.api_key}

    async def stt(self, audio_bytes: bytes, language_code: str = "hi-IN") -> Dict[str, Any]:
        validate_stt_audio(audio_bytes)
        url = f"{self.base_url}/stt/v3"

        boundary = f"----JaanchBoundary{uuid.uuid4().hex}"
        fields = {
            "model": os.environ.get("STT_MODEL", "prisma-v2.5"),
            "language_code": language_code,
            "format": "transcribe"
        }
        files = {
            "audio_file": ("audio.wav", audio_bytes, "audio/wav")
        }
        body = encode_multipart_form(fields, files, boundary)

        headers = self._headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        headers["Content-Length"] = str(len(body))

        max_retries = 3
        backoff = 1.5

        for attempt in range(max_retries):
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30.0) as resp:
                    resp_bytes = resp.read()
                    payload = json.loads(resp_bytes.decode("utf-8"))
                    return {
                        "transcript": payload.get("transcript", "").strip(),
                        "confidence": payload.get("confidence", 1.0),
                        "request_id": payload.get("request_id", ""),
                        "language": payload.get("language", language_code)
                    }
            except urllib.error.HTTPError as exc:
                err_text = exc.read().decode("utf-8", errors="replace")
                if exc.code == 401:
                    raise SpeechAdapterError("Invalid Gnani API Key (401)", status_code=401, code="AUTH_FAILED")
                elif exc.code == 402:
                    raise OutOfCreditsError()
                elif exc.code == 403:
                    raise SpeechAdapterError("Forbidden: Gnani API permission denied (403)", status_code=403, code="FORBIDDEN")
                elif exc.code in (429, 500, 502, 503, 504):
                    if attempt == max_retries - 1:
                        raise SpeechAdapterError(f"Gnani API error {exc.code}: {err_text}", status_code=exc.code)
                    time.sleep(backoff * (attempt + 1))
                else:
                    raise SpeechAdapterError(f"Gnani API error {exc.code}: {err_text}", status_code=exc.code)
            except Exception as exc:
                if attempt == max_retries - 1:
                    raise SpeechAdapterError(f"Network error connecting to Gnani: {exc}", status_code=503)
                time.sleep(backoff * (attempt + 1))

    async def tts(self, text: str, voice: str = "Shivani", speed: float = 1.0) -> bytes:
        url = f"{self.base_url}/api/v1/tts/inference"
        payload_data = {
            "text": text,
            "voice": voice,
            "model": os.environ.get("TTS_MODEL", "timbre-v2.5"),
            "language": "hi-IN",
            "speed": max(0.75, min(1.5, speed))
        }
        body = json.dumps(payload_data).encode("utf-8")

        headers = self._headers()
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = str(len(body))

        max_retries = 3
        backoff = 1.5

        for attempt in range(max_retries):
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30.0) as resp:
                    pcm = resp.read()
                    return wav_from_pcm(pcm, rate=48000, ch=1, bits=16)
            except urllib.error.HTTPError as exc:
                err_text = exc.read().decode("utf-8", errors="replace")
                if exc.code == 401:
                    raise SpeechAdapterError("Invalid Gnani API Key (401)", status_code=401, code="AUTH_FAILED")
                elif exc.code == 402:
                    raise OutOfCreditsError()
                elif exc.code in (429, 500, 502, 503, 504):
                    if attempt == max_retries - 1:
                        raise SpeechAdapterError(f"TTS error {exc.code}: {err_text}", status_code=exc.code)
                    time.sleep(backoff * (attempt + 1))
                else:
                    raise SpeechAdapterError(f"TTS error {exc.code}: {err_text}", status_code=exc.code)
            except Exception as exc:
                if attempt == max_retries - 1:
                    raise SpeechAdapterError(f"Network error connecting to TTS: {exc}", status_code=503)
                time.sleep(backoff * (attempt + 1))


class FixtureGnaniAdapter(BaseSpeechAdapter):
    def __init__(self, fixtures_dir: str):
        self.fixtures_dir = fixtures_dir
        self.stt_dir = os.path.join(fixtures_dir, "stt")
        self.tts_dir = os.path.join(fixtures_dir, "tts")
        os.makedirs(self.stt_dir, exist_ok=True)
        os.makedirs(self.tts_dir, exist_ok=True)

        self.sample_index = {
            "haan": {"transcript": "हाँ सही है", "confidence": 0.98},
            "ji_haan": {"transcript": "जी हाँ", "confidence": 0.96},
            "sahi_hai": {"transcript": "सही है", "confidence": 0.99},
            "nahi": {"transcript": "नहीं", "confidence": 0.95},
            "galat": {"transcript": "गलत है", "confidence": 0.94},
            "nahi_962081": {"transcript": "नहीं 962081", "confidence": 0.93},
            "dobara": {"transcript": "दोबारा बताइए", "confidence": 0.95},
            "ruko": {"transcript": "रुको एक मिनट", "confidence": 0.92},
            "sanjay_nahi_ajay": {"transcript": "संजय नहीं अजय", "confidence": 0.91}
        }

    def _audio_hash(self, audio_bytes: bytes) -> str:
        return hashlib.sha256(audio_bytes).hexdigest()[:16]

    async def stt(self, audio_bytes: bytes, language_code: str = "hi-IN") -> Dict[str, Any]:
        validate_stt_audio(audio_bytes)
        h = self._audio_hash(audio_bytes)
        fixture_path = os.path.join(self.stt_dir, f"{h}.json")

        if os.path.exists(fixture_path):
            with open(fixture_path, "r", encoding="utf-8") as f:
                return json.load(f)

        if len(audio_bytes) > 0 and os.environ.get("MOCK_FIXTURE_KEY"):
            key = os.environ.get("MOCK_FIXTURE_KEY")
            if key in self.sample_index:
                item = self.sample_index[key]
                return {
                    "transcript": item["transcript"],
                    "confidence": item["confidence"],
                    "request_id": f"fixture_{h}",
                    "language": language_code
                }

        # HARD RULE: A fixture miss is an error, never invented text!
        raise FixtureNotFoundError(f"Fixture miss: No saved response for audio hash {h}.")

    async def tts(self, text: str, voice: str = "Shivani", speed: float = 1.0) -> bytes:
        t_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        fixture_path = os.path.join(self.tts_dir, f"{t_hash}.wav")

        if os.path.exists(fixture_path):
            with open(fixture_path, "rb") as f:
                return f.read()

        empty_pcm = b"\x00" * 48000 * 2  # 1 sec of silence at 48kHz mono 16-bit
        return wav_from_pcm(empty_pcm, rate=48000, ch=1, bits=16)


class RecordGnaniAdapter(BaseSpeechAdapter):
    def __init__(self, live_adapter: LiveGnaniAdapter, fixture_adapter: FixtureGnaniAdapter):
        self.live = live_adapter
        self.fixture = fixture_adapter

    async def stt(self, audio_bytes: bytes, language_code: str = "hi-IN") -> Dict[str, Any]:
        result = await self.live.stt(audio_bytes, language_code)
        h = self.fixture._audio_hash(audio_bytes)
        path = os.path.join(self.fixture.stt_dir, f"{h}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        return result

    async def tts(self, text: str, voice: str = "Shivani", speed: float = 1.0) -> bytes:
        wav_data = await self.live.tts(text, voice, speed)
        t_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        path = os.path.join(self.fixture.tts_dir, f"{t_hash}.wav")
        with open(path, "wb") as f:
            f.write(wav_data)
        return wav_data


def get_speech_adapter(mode: str, api_key: Optional[str] = None, base_url: str = "https://api.vachana.ai", fixtures_dir: Optional[str] = None) -> BaseSpeechAdapter:
    if fixtures_dir is None:
        fixtures_dir = os.path.join(os.path.dirname(__file__), "..", "fixtures")

    fixture_adapter = FixtureGnaniAdapter(fixtures_dir)

    if mode == "fixture":
        return fixture_adapter

    if not api_key:
        return fixture_adapter

    live_adapter = LiveGnaniAdapter(api_key, base_url)

    if mode == "live":
        return live_adapter
    elif mode == "record":
        return RecordGnaniAdapter(live_adapter, fixture_adapter)
    elif mode == "auto":
        return live_adapter if api_key else fixture_adapter

    return fixture_adapter
