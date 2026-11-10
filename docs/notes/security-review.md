# Security & Privacy Review (`docs/notes/security-review.md`)

A comprehensive pre-submission review of security boundaries, permission scopes, data isolation, and privacy invariants.

---

## 10-Point Checklist & Audit Results

| # | Inspection Item | Verification Result | Status |
|---|---|---|---|
| **1** | **Manifest Permissions & Host Scope** | `permissions`: `["storage", "alarms"]`. Local proxy hosts plus `<all_urls>` are present for universal live-portal support. Remote code execution is absent. | **PASS (by project invariant)** |
| **2** | **Secret & Key Leakage Prevention** | Full codebase scanned for hardcoded API keys or bearer tokens. `proxy/.env` is excluded in `.gitignore`. Keys are injected strictly via server environment variables. | **PASS** |
| **3** | **Network Data Egress** | Readback TTS now uses the on-device Web Speech API; the extension does not call `/tts` with form text. The only personal-data egress is customer reply audio to `POST /stt`. Field values and transcripts are not logged. | **PASS** |
| **4** | **Sanitized Server Logs** | Proxy logging middleware records HTTP method, endpoint path, response status, and duration (ms). Request bodies, audio binary payloads, and transcripts are never dumped into server logs. | **PASS** |
| **5** | **Ephemeral Session Storage** | All runtime state is contained strictly in `chrome.storage.session`. No `localStorage` or `sync` storage is used. Session data automatically purges on form submission, tab closure, or 30 minutes of inactivity (`chrome.alarms`). | **PASS** |
| **6** | **CORS & Rate Protection** | Proxy enforces strict CORS origin checks (`ALLOWED_ORIGIN`), a per-session cap (40 calls), and a global credit cap (4500.0 credits) to prevent denial-of-wallet exhaustion. | **PASS** |
| **7** | **User Notice & Consent** | Popup and settings page communicate the voice-processing and session-storage behavior. | **PASS** |
| **8** | **Synthetic Data Integrity** | 100% of names, registration numbers, and dates of birth across test cases, mocks, and fixtures are synthetically generated. No real citizen data is stored or referenced. | **PASS** |
| **9** | **Deterministic Logic (No LLM)** | Verification, date comparison, and intent parsing use pure rule-based JavaScript (`extension/lib/`). Zero LLM hallucinations; extracted values must appear verbatim in the speech transcript. | **PASS** |
| **10** | **Human Operator Autonomy** | Jaanch is an assistive tool that flags discrepancies to the operator. It never automatically modifies or submits forms on behalf of the customer. The operator retains final decision power (`[Accept]`, `[Keep]`, `[Ask Again]`). | **PASS** |

## 2026-11-10 Component and pipeline review

- Removed field values from the content script discovery log (the log is removed entirely).
- Removed the popup log that printed the STT transcript.
- Removed the `/tts` request path from the extension audio player so form readback text remains local.
- Removed duplicate content-script session writes and duplicate discovery messages; the service worker persists updates, while the iframe bridge continues to update the embedded popup.
- Added `extension/content/field-model.js` for field-record construction, loaded before the content controller in the manifest.
- `node --test` and the extension wiring tests pass; `git diff --check`: clean.

The manifest still includes `<all_urls>` because universal access to live portals is a non-negotiable project invariant. This intentionally differs from the older generic MV3 skill checklist that recommends restricting host matches.
