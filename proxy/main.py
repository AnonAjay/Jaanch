"""
Jaanch Speech Proxy Service (proxy/main.py)
Stateless FastAPI server holding Gnani API keys with credit caps, CORS origin locks, and privacy-first logging.
"""

import sys
import os
import time
import logging
from typing import Optional
from dotenv import load_dotenv

# Ensure both project root and proxy dir are in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_parent_dir = os.path.abspath(os.path.join(_current_dir, ".."))
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

try:
    from proxy.guard.budget import BudgetGuard, BudgetExceededError
    from proxy.speech.adapter import get_speech_adapter, SpeechAdapterError, FixtureNotFoundError
    from proxy.speech.wav_util import validate_stt_audio
except ImportError:
    from guard.budget import BudgetGuard, BudgetExceededError
    from speech.adapter import get_speech_adapter, SpeechAdapterError, FixtureNotFoundError
    from speech.wav_util import validate_stt_audio

# Load environment
load_dotenv()

GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")
GNANI_BASE_URL = os.getenv("GNANI_BASE_URL", "https://api.vachana.ai")
GNANI_MODE = os.getenv("GNANI_MODE", "auto")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "*")
GLOBAL_CREDIT_LIMIT = float(os.getenv("GLOBAL_CREDIT_LIMIT", "4500.0"))
PER_SESSION_STT_CAP = int(os.getenv("PER_SESSION_STT_CAP", "40"))

# Configure privacy-safe logging (Counts, Latency, Status only)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Proxy] %(message)s"
)
logger = logging.getLogger("jaanch.proxy")

app = FastAPI(title="Jaanch Speech Proxy", version="0.1.0")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN, "http://localhost:*", "http://127.0.0.1:*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize Budget Guard and Speech Adapter
budget_guard = BudgetGuard(
    global_cap=GLOBAL_CREDIT_LIMIT,
    per_session_cap=PER_SESSION_STT_CAP,
    cost_per_request=0.59
)

speech_adapter = get_speech_adapter(
    mode=GNANI_MODE,
    api_key=GNANI_API_KEY,
    base_url=GNANI_BASE_URL
)


@app.middleware("http")
async def privacy_logging_middleware(request: Request, call_next):
    """
    Privacy Invariant: Log request timing, status code, and endpoint ONLY.
    NEVER log audio content, parameters, transcripts, or personal citizen data.
    """
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    # Safe log: Method, Path, Status, Duration
    logger.info(
        f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f}ms)"
    )
    return response


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "jaanch-proxy",
        "mode": GNANI_MODE,
        "has_key": bool(GNANI_API_KEY),
        "version": "0.1.0"
    }


@app.get("/budget")
async def budget():
    status = budget_guard.get_status()
    status["mode"] = GNANI_MODE
    return status


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "Shivani"
    speed: Optional[float] = 1.0


@app.post("/stt")
async def stt(
    audio_file: UploadFile = File(...),
    language_code: Optional[str] = Form("hi-IN"),
    x_session_id: Optional[str] = Header(None)
):
    session_id = x_session_id or "default"

    try:
        # 1. Budget & session cap check
        is_live = (GNANI_MODE in ("live", "record")) or (GNANI_MODE == "auto" and bool(GNANI_API_KEY))
        budget_guard.check_and_charge(session_id=session_id, is_live=is_live)

        # 2. Read and validate audio
        audio_bytes = await audio_file.read()
        validate_stt_audio(audio_bytes, max_duration_sec=25.0)

        # 3. Call adapter
        result = await speech_adapter.stt(audio_bytes, language_code=language_code)
        return result

    except BudgetExceededError as e:
        logger.warning(f"Budget cap triggered: {str(e)}")
        raise HTTPException(status_code=402, detail=str(e))
    except ValueError as e:
        # Invalid audio duration or format
        raise HTTPException(status_code=400, detail=str(e))
    except FixtureNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SpeechAdapterError as e:
        logger.error(f"Speech adapter error: {e.code} - {str(e)}")
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"Internal proxy error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/tts")
async def tts(req: TTSRequest):
    """
    TTS generation endpoint for prompts and offline clips.
    Not used for citizen personal data in v1.
    """
    try:
        wav_bytes = await speech_adapter.tts(
            text=req.text,
            voice=req.voice or "Shivani",
            speed=req.speed or 1.0
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except SpeechAdapterError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="TTS generation failed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
