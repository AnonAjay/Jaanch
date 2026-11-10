---
name: gnani-speech-proxy
description: Use when building or testing the thin stateless proxy that holds Gnani API keys and calls Prisma STT and Timbre TTS, including fixtures, caps, retries and WAV wrapping.
---
# Gnani speech proxy skill

## Facts (team Day-1 notes; confirm with one probe)
- Base `https://api.vachana.ai`, header `X-API-Key-ID: <key>`.
- STT `POST /stt/v3` multipart: `audio_file`, `model=prisma-v2.5`, `language_code` (`hi-IN`, `indic-auto`), `format=transcribe`. Hard limit 30 s; send 16 kHz mono 16-bit WAV of at most 25 s.
- TTS `POST /api/v1/tts/inference` JSON: `text`, `voice` (Shivani or Avinash on v2.5), `model=timbre-v2.5`, `language=hi-IN`, `speed` 0.75 to 1.5. Response is raw PCM mono 16-bit 48 kHz: wrap in a 44-byte WAV header at 48 kHz.
- Errors: 401 alert, no retry; 402 switch to sample mode; 403 alert; 429 and 5xx retry at most 3 times, base delay 1.5 s.

## WAV header (Python)
```python
import struct
def wav_from_pcm(pcm: bytes, rate=48000, ch=1, bits=16) -> bytes:
    byte_rate = rate * ch * bits // 8
    hdr = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, ch, rate, byte_rate, ch * bits // 8, bits) + b"data" + struct.pack("<I", len(pcm))
    return hdr + pcm
```

## Rules
- Modes `live | record | fixture | auto`. A fixture miss is an error, never invented text.
- Keys from env only. Never log audio, transcripts, or field values; log counts, latency, status.
- Enforce per-session and global credit caps server-side. CORS: extension origin only.
- Return readable error codes the UI can map to messages.

## Tests
Use fixtures so tests cost no credits. Cover: 401, 402, 429 retry limit, 5xx retry limit, fixture hit and miss, oversize audio rejected, CORS rejection.
