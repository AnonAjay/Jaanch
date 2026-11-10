# Architecture

This document describes the current implementation. Synthetic form data is used only in fixtures and benchmarks; the extension operates on live portals.

## Runtime flow

```text
Live portal
  └─ content script discovers fields, watches edits, and adds the Recheck trigger
       ├─ runtime messages → service worker → chrome.storage.session
       └─ postMessage bridge → embedded popup fallback, when open

Toolbar action ──────┐
Page sticker ────────┴→ same embedded popup → field review and operator decisions
                                      ├─ local speech readback
                                      ├─ mic capture and 16 kHz WAV encoding
                                      └─ reply audio → proxy /stt → deterministic logic
```

Both triggers toggle one content-script-hosted popup frame, so they cannot open separate UI instances. The service worker routes toolbar clicks and stores session state, then handles idle cleanup. It does not access page DOM, microphone, or audio playback.

## Extension components

- `extension/manifest.json`: MV3 action popup, options page, content script, session storage, and idle alarms. `<all_urls>` is required for the live portal requirement.
- `extension/content/field-model.js`: creates normalized field records.
- `extension/content/content.js`: portal field discovery, live change reporting, submit-adjacent Recheck trigger, and iframe bridge.
- `extension/background/service-worker.js`: message routing and 30-minute session cleanup.
- `extension/popup/`: popup UI, styling, and controller for verification and summary screens.
- `extension/settings/`: full-page language, microphone, voice, and session settings.
- `extension/lib/`: deterministic normalization/comparison, intent parsing, audio, and microphone helpers.
- `extension/assets/audio/`: generated, non-personal Hindi readback clips.

## State and message boundaries

Runtime state is held in `chrome.storage.session` and cleared on submit, tab close, manual reset, or 30 minutes idle. Form values remain local. The iframe uses `postMessage` only to keep its popup view synchronized with the host page.

| Message/data | Route | Personal data |
|---|---|---|
| `FIELDS_DISCOVERED` | Content script → service worker → session storage | Labels/field metadata only |
| `FIELD_CHANGED` | Content script → service worker → session storage | Yes, local only |
| `RECHECK_CLICKED` | Content script → service worker | No |
| Reply WAV | Popup → proxy `/stt` | Voice audio |
| Readback text | Popup → on-device speech synthesis | Yes, stays on device |

The extension does not send form values or transcripts to `/tts`. The proxy `/tts` route remains available for non-personal callers, but the extension does not use it.

## Deterministic verification

`extension/lib/normalize.js`, `intents.js`, and `compare.js` implement parsing and comparison without an LLM. An extracted correction must appear in the transcript after normalization. The operator chooses whether to accept, keep, or ask again. Form submission remains a human action.

## Proxy and evaluation

- `proxy/`: stateless speech proxy, key isolation, budget guard, and WAV validation.
- `eval/`: synthetic seeded-error and spoken-reply cases.
- `tests/fixtures/`: synthetic offline portal layouts used by discovery tests.
- `spikes/`: small proof-of-concept scripts retained for audio, mic, and proxy checks.
