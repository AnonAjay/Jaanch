# Agents and Ownership Lanes

This document defines the agent roles, responsibilities, ownership boundaries, and core invariants for **Jaanch**.

---

## Core Invariants (Non-Negotiable)

1. **Live Portal Safety & Synthetic Benchmarking**: The extension is built to operate safely on actual live portals (Google Forms, NIC/SSC government portals, CSC kiosks, university portals). Automated evaluation suites and regression benchmarks use strictly synthetic data profiles.
2. **Key Isolation**: Gnani API keys live strictly in `proxy/.env` (or environment variables). Never in the Chrome extension, git repository, logs, or chat.
3. **No Automatic Form Submission**: The extension never alters or submits the form directly on behalf of the customer. The human operator always retains final decision and control (Accept, Keep, Ask again).
4. **Deterministic Local Logic (No LLM in v1)**: All intent classification, number parsing, and comparisons happen in `extension/lib/` deterministically. Any extracted replacement value MUST appear verbatim (post-normalization) in the customer's speech transcript.
5. **Session-Only Storage**: All runtime state lives in `chrome.storage.session`. All data is wiped on form submit, page navigation/unload, tab close, or 30 minutes of idle time.
6. **Live Portal Universal Access & Minimal Permissions**: The Chrome extension operates universally across live web portals (`<all_urls>`) using minimal required browser APIs (`storage`, `sidePanel`, `alarms`).
7. **Zero-Latency Spoken Readback**: Spoken readbacks use pre-generated, locally cached Hindi audio clips for numbers, letters, months, and prompts. Readback emits zero personal data over the network.
8. **Verification Over Assumption**: Never guess API behavior or features. Validate each step with spikes and concrete unit/eval runs. Update `.agents/memory/STATE.md` after every milestone.

---

## Ownership Lanes

| Agent Lane | Owned Paths | Primary Responsibilities |
|---|---|---|
| **0. Orientation / Orchestrator** | `.agents/`, `docs/DECISIONS.md` | Architecture alignment, scope enforcement, task sequencing, state tracking. |
| **1. Spike Agent** | `spikes/` | Rapid proof-of-concept verification (Gate A: content script reading, audio playback, mic capture, proxy health). |
| **2. Logic Agent** | `extension/lib/`, `tests/unit/` | Pure JS normalization (`normalize.js`), rule-based intent parsing (`intents.js`), date/digit/name comparators (`compare.js`), unit tests (`node --test`). |
| **3. Proxy Agent** | `proxy/`, `docs/notes/proxy.md` | Thin stateless FastAPI server (`/health`, `/stt`, `/tts`, `/budget`), Gnani API adapter, credit caps, CORS origin locks, fixture replay. |
| **4. Audio Agent** | `scripts/`, `extension/assets/audio/` | Scripting pre-generated Hindi audio assets (digits, letters A-Z, months, prompts) and `manifest.json`. No personal data. |
| **5. Extension Agent** | `extension/` (excluding `lib/` and `assets/`) | Manifest V3 setup, Content Script (field discovery, Shadow DOM Recheck button), Service Worker router, Side Panel UI, mic setup page. |
| **6. Eval Agent** | `eval/`, `tests/e2e/` | 40 synthetic seeded-error cases, 30 spoken test cases, eval runner script, pass/fail metrics, SNR noise testing. |
| **7. Docs Agent** | `README.md`, `docs/notes/`, `video/` | Clear documentation, data-flow diagrams, evaluated metrics reporting, 60s demo video script & shot list, hackathon submission post. |
