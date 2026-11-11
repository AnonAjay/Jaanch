# Jaanch (जाँच) — Voice-Assisted Form Verification Companion

> **Zero-latency spoken Hindi read-back and voice verification to prevent costly form-filling errors at CSCs and cyber cafes.**

[![Evaluation: 100% Seeded Detection](https://img.shields.io/badge/Evaluation-100%25%20Detection-brightgreen)](#3-measured-evaluation-results)
[![False-Flag Rate: 0.0%](https://img.shields.io/badge/False--Flags-0.0%25-success)](#3-measured-evaluation-results)
[![Zero-Tolerance: 0 Violations](https://img.shields.io/badge/Zero--Tolerance-0%20Violations-blue)](#4-security--privacy-invariants)
[![Gnani AI Powered](https://img.shields.io/badge/Powered%20By-Gnani.ai-orange)](https://gnani.ai)

---

## 1. The Problem

At cyber cafes and Common Service Centers (CSCs) across India, single operators manually type citizen details into state, central, and university portals for dozens of people a day. A single keystroke slip—such as typing the 8th instead of the 18th for date of birth, misspelling an applicant's name, or flipping a district—routinely leads to irreversible rejections and costly legal battles (e.g. *Supreme Court Jan 2024* reviving a candidate's application after a cyber cafe operator entered the wrong birth date; *Delhi High Court* cases citing bona fide reliance on cafe staff).

Citizens often have low digital literacy or struggle to inspect small on-screen text over an operator's shoulder in noisy kiosk environments.

**Jaanch (जाँच)** bridges this gap by reading back entered fields out loud in Hindi with spelled-out letters and grouped numbers, allowing the citizen to confirm or verbally correct their data before the form is submitted.

---

## 2. Architecture & Data Flow

```text
+------------------------------------------------------------------------------+
| 1. Universal Live Portal Discovery & In-Page Overlay (content.js)            |
|   - Discovers input, select, textarea, role="textbox", & contenteditable     |
|   - 9-strategy label extraction + kind inference (name, date, digits, email, |
|     district, text); filters CAPTCHAs, CSRF tokens, hidden & search inputs   |
|   - Injects Shadow DOM pill beside submit ("जाँच ->" / "Recheck with Jaanch")|
|   - Hosts 612x415px iframe modal (allow="microphone") across SPA routes       |
|     using popstate / hashchange / MutationObserver (no webNavigation needed) |
+---------------------------------------+--------------------------------------+
                                        |
                         FIELD SNAPSHOT & USER TRIGGER
                                        v
+------------------------------------------------------------------------------+
| 2. 3-View Verification UI & Editable Session DB (popup/ & settings/)         |
|   - Homepage: Concentric 3-layer Indic orbital rings around central जाँच orb |
|   - Active Field View:                                                       |
|     * Title TTS [🔊] & Value TTS [🔊] via on-device Web Speech API (hi-IN)   |
|     * Auto-resizing editable value textarea (42px->17px adaptive scaling)    |
|     * Bottom controls: Confirm (✔), Reject (✖), Paused/Auto mic toggle       |
|   - Summary View: Borderless inline-editable textarea rows + status chips    |
|     * Actions: [Apply to Form], [Recheck All], [Ask Unverified]              |
|   - Full-Page Settings: Live RMS mic meter, auto-detected form language,     |
|     Shivani/Avinash voice preview, /health & /budget monitor, manual wipe    |
+-------------------+-----------------------------------+----------------------+
                    |                                   |
   Mic Paused (Default during TTS)          User Taps [Paused] -> [Auto]
   On-device hi-IN readback only            Captures 1 utterance (16kHz WAV),
   (zero network egress)                    auto-pauses back on speech end
                    |                                   |
                    |                                   v
                    |       +--------------------------------------------------+
                    |       | 3. Service Worker Relay & Stateless FastAPI Proxy|
                    |       |   - SW relays PROXY_HEALTH & PROXY_STT to        |
                    |       |     127.0.0.1:8000 (bypasses iframe PNA/CORS)    |
                    |       |   - Validates WAV <= 25s before charging credits |
                    |       |   - AutoGnaniAdapter (GNANI_MODE=auto): checks    |
                    |       |     local fixtures -> live Gnani Prisma v2.5 STT |
                    |       |   - Uses form-detected language (en/hi/bn/mr/ta/te)|
                    |       |   - Enforces 4500.0 credit & 40/session caps     |
                    |       +-----------------------+--------------------------+
                    |                               | Transcript
                    v                               v
+------------------------------------------------------------------------------+
| 4. Deterministic Local Small Field Extractor & Autofill (extractor.js)       |
|   - 100% local, zero-LLM rule engine (intents, normalize, compare, spell)    |
|   - Supports spoken edits, blank/unfilled field dictation, multi-field       |
|     labeled utterances, email ("at"/"dot"), spaced digits, & instructions    |
|   - Zero-Hallucination Invariant: replacement values must appear verbatim    |
|     (post-normalization) in the STT transcript                               |
|   - [Apply to Form] safely writes Session DB values to DOM (#2FBF9B flash);  |
|     never auto-submits; wiped on submit, beforeunload, or 30m idle alarm     |
+------------------------------------------------------------------------------+
```

---

## 3. Measured Evaluation Results

Evaluated on our synthetic benchmark suite ([`eval/cases/cases.json`](eval/cases/cases.json) and [`eval/replies/replies.json`](eval/replies/replies.json)):

### A. Seeded-Error Form Evaluation (40 Cases)

| Error Type | Cases | Detected | Missed | Detection Rate | Notes |
|---|---|---|---|---|---|
| **Digit Swap** | 8 | 8 | 0 | **100.0%** | Adjacent and middle digit transpositions (e.g. `20` $\rightarrow$ `02`, `18` $\rightarrow$ `81`) |
| **Day/Month Swap** | 8 | 8 | 0 | **100.0%** | Day and month swapped (e.g. `12/03/1978` vs `03/12/1978`) |
| **Name Letter Slip** | 8 | 8 | 0 | **100.0%** | Omitted, extra, or substituted letters (e.g. `Sanjay` $\rightarrow$ `Sajay`) |
| **District Mismatch** | 8 | 8 | 0 | **100.0%** | Wrong district selected (valid aliases like `Banaras` / `Varanasi` pass) |
| **Clean Baseline** | 8 | 8 (Clean) | 0 (False Flags) | **0.0% False Flags** | Robust against casing, date delimiters, aliases, and Devanagari numerals |

### B. Spoken Reply Intent Evaluation (30 Scenarios)
- **Total Spoken Scenarios**: 30
- **Intent Classification Accuracy**: **96.7%** (29 / 30 scenarios handled correctly by deterministic rules)
- **Value Extractions**: **9 / 9** (100% correct extraction of candidate values)
- **Zero-Tolerance Invariant**: **0 violations** (100% of extracted values appeared verbatim in speech transcripts)
- **Spoken Prompt Latency**: **< 5ms** (instant playback from locally cached extension assets)

### C. Live Portal Universal Compatibility (Verified on Core Layout Architectures)

| Live Portal Architecture | Field Discovery | Kinds Inferred | Recheck Injection | Submit Session Wiper | Status |
|---|---|---|---|---|---|
| **Google Forms** (`docs.google.com/forms/*`) | 4 / 4 (100%) | Name, Date, District, Digits | Inline next to `role="button"` | Triggered on submit | **PASS** |
| **NIC / SSC Govt Portals** (`*.nic.in`, `*.gov.in`) | 4 / 4 (100%) | Name, Date, District, Digits | Inline next to `input[type="submit"]` | Triggered on form submit | **PASS** |
| **Standard / Headless Web Portals** | 4 / 4 (100%) | Name, Date, District, Digits | Floating Action Pill fallback | Triggered on navigation | **PASS** |

*Verified by automated integration tests in [`tests/test_universal_forms.test.js`](tests/test_universal_forms.test.js) against HTML layout fixtures in [`tests/fixtures/`](tests/fixtures/).*

---

## 4. Security & Privacy Invariants

1. **Live Portal Safety & Synthetic Benchmarking**: Built to operate safely on live portals (Google Forms, NIC/SSC government portals, CSC kiosks). Evaluation benchmarks and fixtures use strictly synthetic candidate profiles.
2. **Key Isolation**: Gnani API credentials live strictly in local `.env` / `proxy/.env` (gitignored via `.gitignore`) or server environment variables. Keys are never bundled into the Chrome extension, committed to git, or written to logs.
3. **Human-in-the-Loop Autofill (No Automatic Form Submission)**: Jaanch stores verified and corrected values in an editable Session DB and populates the page DOM only when the operator clicks **Apply to Form**. It never automatically submits forms.
4. **Zero-LLM Deterministic Verification**: Intent classification, multi-field extraction, normalization, and comparisons run locally in `extension/lib/` (`extractor.js`, `intents.js`, `normalize.js`, `compare.js`). Any extracted replacement value **must appear verbatim** (post-normalization) in the STT transcript.
5. **Ephemeral Session Storage**: Runtime state is stored exclusively in `chrome.storage.session` and wiped on form submit, page unload (`beforeunload`), tab close, manual wipe in Settings, or 30 minutes of idle (`chrome.alarms`).
6. **Universal Portal Access & Minimal Permissions**: The MV3 manifest requests only `storage` and `alarms` permissions alongside `<all_urls>` and localhost proxy access (`127.0.0.1` / `localhost`), handling SPA routes without needing `webNavigation`.
7. **On-Device Readback & Paused-by-Default Mic**: Verification readback uses on-device `window.speechSynthesis` (never sending citizen form data to `/tts`). The microphone stays **Paused** by default during Hindi TTS verification, captures one utterance only when the operator activates **Auto**, and auto-pauses immediately after speech ends so only single-turn reply audio is sent to `POST /stt`.

---

## 5. Speech & Readback Stack

- **Gnani Prisma STT (`prisma-v2.5`)**: Transcribes spoken corrections, confirmations, and blank-field entries via `POST /stt` (`format=transcribe`), using the language auto-detected from the active web form (`en-IN`, `hi-IN`, `bn-IN`, `mr-IN`, `ta-IN`, `te-IN`).
- **On-Device Verification Readback (`window.speechSynthesis` + `audio-player.js`)**: Speaks field labels and editable values locally in Hindi (`hi-IN`, preferring `Shivani` / `Avinash` voices) with zero network egress of personal form data.
- **Offline Audio Dictionary (`extension/assets/audio/` + `timbre-v2.5`)**: 156 pre-generated 48 kHz mono 16-bit WAV clips (letters `A–Z`, digits `0–9`, numbers `00–99`, 12 months, 4 labels, 4 prompts) built by [`scripts/pregenerate_audio.py`](scripts/pregenerate_audio.py) (supports `timbre-v2.5` via Gnani or offline deterministic synthesis).

---

## 6. Project Structure

```text
Jaanch/
├── AGENTS.md                        # Team boundaries and non-negotiable invariants
├── README.md                        # Project overview, architecture, and setup guide
├── .gitignore                       # Ignores .env, venv/, __pycache__/, node_modules/
│
├── extension/                       # Chrome Manifest V3 extension
│   ├── manifest.json                # MV3 config (<all_urls>, storage, alarms)
│   ├── background/
│   │   └── service-worker.js        # Session DB sync, 30m idle wipe, PROXY_HEALTH/PROXY_STT relay
│   ├── content/
│   │   ├── field-model.js           # Canonical Session DB record factory (JaanchFieldModel)
│   │   └── content.js               # Universal DOM discovery, Shadow DOM pill, SPA sync & DOM autofill
│   ├── popup/                       # 612x415px iframe UI (Homepage, Verification, Summary)
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js                 # Dual TTS triggers, Paused/Auto VAD loop, editable textareas, Apply
│   ├── settings/                    # Dedicated full-page settings UI
│   │   ├── settings.html
│   │   ├── settings.css
│   │   └── settings.js              # Live RMS mic meter, language detection, voice preview, proxy status
│   ├── lib/                         # Pure JS deterministic modules (ES & CJS compatible)
│   │   ├── extractor.js             # Local Small Field Extractor, multi-field & blank fill, form lang detect
│   │   ├── intents.js               # Spoken intent classifier & verbatim candidate extraction
│   │   ├── normalize.js             # Devanagari-to-ASCII digits & strict DMY/ISO/Hindi date parsing
│   │   ├── compare.js               # DMY swap detector, digit/name/district comparators
│   │   ├── spell.js                 # Letter, digit, and date readback tokenization
│   │   ├── audio-player.js          # On-device Web Speech readback + cached WAV playback
│   │   └── vad.js                   # AudioContext unlock, RMS VAD, 16kHz mono PCM16 WAV encoder
│   └── assets/audio/                # 156 pre-generated WAV clips & manifest.json
│
├── proxy/                           # Thin stateless FastAPI proxy (127.0.0.1:8000)
│   ├── main.py                      # /health, /budget, /stt, /tts, CORS & PNA headers, sanitized logs
│   ├── guard/budget.py              # Global credit limit (4500.0) & per-session cap (40 calls)
│   ├── speech/adapter.py            # LiveGnaniAdapter, FixtureGnaniAdapter, RecordGnaniAdapter, AutoGnaniAdapter
│   ├── speech/wav_util.py           # WAV header inspection & 25s duration guard
│   ├── fixtures/                    # Optional local fixture audio/transcript cache for offline replay
│   └── requirements.txt             # fastapi, uvicorn, python-multipart, httpx, pydantic, python-dotenv, pytest
│
├── eval/                            # Synthetic evaluation suites & benchmark runner
│   ├── cases/cases.json             # 40 synthetic seeded-error form cases
│   ├── replies/replies.json         # 30 spoken reply scenarios
│   ├── run_eval.js                  # Automated evaluation runner
│   └── results/                     # Generated reports (EVAL_REPORT.md)
│
├── scripts/
│   └── pregenerate_audio.py         # Generates 156 offline 48kHz WAV clips + manifest.json
│
├── spikes/                          # Gate A proof-of-concept spikes (Spike 1 to 4) & dashboard
│
├── tests/                           # Unit and integration test suites
│   ├── unit/                        # Node.js unit tests (normalize, compare, intents, spell, extractor)
│   ├── fixtures/                    # HTML form fixtures (google_form, gov_portal, standard_form)
│   ├── proxy_test.py                # Unit tests for WAV validation & budget guards
│   ├── test_proxy_endpoints.py      # FastAPI endpoint integration tests
│   ├── test_audio_assets.py         # Asset integrity tests for 156 WAV clips
│   ├── test_extension_wiring.js     # MV3 manifest and module wiring tests
│   ├── test_popup_ui.test.js        # Popup & Settings UI pipeline integration tests
│   └── test_universal_forms.test.js # Universal portal discovery & DOM apply tests
│
├── video/
│   └── SHOT_LIST.md                 # 60-second walkthrough script & shot list
│
└── docs/                            # Specs, decisions, notes, and hackathon submission drafts
```

---

## 7. Quickstart & Running Locally

### Step 1: Configure Gnani Credentials (`.env`)
By default (`GNANI_MODE=auto`), `proxy/main.py` loads environment variables via `python-dotenv` (`proxy/.env` or repo root `.env`). If `GNANI_API_KEY` is missing or empty, the proxy falls back to local fixture replay (`FixtureGnaniAdapter`), which returns HTTP `404` (`Fixture miss: No saved response for audio hash <hash>.`) on live microphone audio unless cached fixtures exist in `proxy/fixtures/stt/`.

Create `proxy/.env` (never commit this file):

```env
GNANI_API_KEY=your_gnani_api_key_here
GNANI_BASE_URL=https://api.vachana.ai
GNANI_MODE=auto
STT_MODEL=prisma-v2.5
TTS_MODEL=timbre-v2.5
TTS_VOICE=Shivani
PER_SESSION_STT_CAP=40
GLOBAL_CREDIT_LIMIT=4500.0
ALLOWED_ORIGIN=chrome-extension://REPLACE_WITH_EXTENSION_ID
```

### Step 2: Start the FastAPI Speech Proxy
Using a Python virtual environment (`venv`):

```bash
cd proxy
python -m venv venv
# Windows (PowerShell): .\venv\Scripts\Activate.ps1
# macOS/Linux:          source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

*(Or activate your Conda environment and run `uvicorn main:app --host 127.0.0.1 --port 8000 --reload` from `proxy/`.)*

Verify proxy health before testing STT:

```bash
curl http://127.0.0.1:8000/health
```

Confirm the response includes `"ok": true`, `"mode": "auto"`, and `"has_key": true`.

### Step 3: Run Test Suites & Benchmarks
Requires **Node.js** (built-in `node:test`) for JavaScript suites and **Python (`pytest`)** for backend/audio suites. Run the commands below from the **`Jaanch/` repository root**:

```bash
# Pure JS Logic, Extractor, Extension Wiring, Popup UI, & Universal Form tests
node --test tests/unit/normalize.test.js tests/unit/compare.test.js tests/unit/intents.test.js tests/unit/spell.test.js tests/unit/extractor.test.js tests/test_extension_wiring.js tests/test_popup_ui.test.js tests/test_universal_forms.test.js

# Gate A Proof-of-Concept Spikes
node --test spikes/spike1_test.js spikes/spike2_test.js spikes/spike3_test.js

# Proxy, Endpoint, & Offline Audio Asset tests (run with proxy venv/Python)
pytest tests/proxy_test.py tests/test_proxy_endpoints.py tests/test_audio_assets.py

# Synthetic Benchmark Suite
node eval/run_eval.js
```

### Step 4: Load the Chrome Extension & Verify on a Live Form
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the [`extension/`](extension/) folder.
4. Open any web form (live Google Form, government portal, or an HTML file in [`tests/fixtures/`](tests/fixtures/)).
5. Click the floating **`जाँच ->`** (`Recheck with Jaanch`) trigger near the submit button (or the extension toolbar icon) to open the verification modal.
6. Use **`🔊`** beside a field title or value box to hear **Hindi TTS readback**, edit values directly in the auto-resizing textareas, or toggle **`Paused` -> `Auto`** to speak an edit or blank-field entry in the **form's detected language** (the mic automatically pauses after each utterance).
7. Switch to **Summary** and click **`Apply to Form`** to write Session DB edits safely back to the page fields (`#2FBF9B` highlight).

---

## 8. Honest Limitations

- **Prototype on Synthetic Data**: Evaluated on our synthetic benchmark profiles (40 form cases, 30 spoken replies); not yet piloted with live CSC operators in production.
- **v1 Extraction & Language Coverage**: Form discovery handles standard and dynamic controls (`text`, `name`, `date`, `digits`, `email`, `district`), with Hindi verification TTS and deterministic STT/autofill language matching for `en-IN`, `hi-IN`, `bn-IN`, `mr-IN`, `ta-IN`, and `te-IN`. Complex bespoke multi-step widgets may still require manual textarea review on the Summary tab.
- **Human in the Loop**: Jaanch never automatically submits forms; the operator explicitly triggers **Apply to Form** and final form submission.

---

## 9. Hackathon Submission Details

- **Challenge**: The Great Indian AI Internship Challenge (gnani.ai)
- **Hashtags**: `#GreatIndianAIInternshipChallenge` `#GnaniAI`
- **Models**: Gnani Prisma STT (`prisma-v2.5`), Gnani Timbre TTS (`timbre-v2.5`) + On-Device Web Speech API
- **Video Walkthrough**: 60-second shot list in [`video/SHOT_LIST.md`](video/SHOT_LIST.md)
- **Social Posts**: Post drafts in [`docs/SUBMISSION.md`](docs/SUBMISSION.md)
