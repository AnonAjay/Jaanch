# Proxy Component Notes (`proxy/`)

## Plain Language Overview
The proxy is a thin, stateless FastAPI service that keeps Gnani API keys strictly on the server. It handles STT (Prisma v2.5) and TTS (Timbre v2.5), enforces credit caps and session quotas, and logs counts/latency without citizen data.

## Data Flow
```
Extension Side Panel --[WAV 16kHz mono]--> POST /stt -> Budget Guard
   -> Speech Adapter (Live / Record / Fixture / Auto)
   -> Gnani Prisma (https://api.vachana.ai/stt/v3)
   <-- [JSON {transcript, confidence}] <-- Proxy Response
```

## Modes & Key Invariants
- **Modes**: `fixture` (free offline replays), `record` (saves live responses to fixtures), `live` (direct API), `auto` (fixture if available, else live).
- **Zero Hallucination on Fixture Miss**: Raises HTTP 404 rather than inventing transcripts.
- **Privacy Logging**: Logs only timestamp, HTTP method, status, and latency. Never logs audio bytes, transcripts, or field values.
- **Credit Guards**: Hard cap at 4500.0 credits globally, 40 requests per session.
