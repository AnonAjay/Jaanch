# Decisions (one line each, dated)
- 2026-11-09: v1 scope: 4 fields, Hindi, mock portal, no LLM, no certificate OCR, spelled letters and digits from cached audio.
- 2026-11-09: Proxy is a thin stateless service that holds keys; comparison logic stays in the extension.
- 2026-11-09: Fallback if the mic fails in the extension: same logic and UI as an in-page overlay on the mock portal.
- 2026-11-09: Preset Eval Pass Lines: Seeded error detection >= 90%; False-flag rate = 0%; Spoken intent accuracy >= 90%; Zero-tolerance on returned values outside transcripts (100% compliance).
