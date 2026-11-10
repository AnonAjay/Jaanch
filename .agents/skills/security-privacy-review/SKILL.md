---
name: security-privacy-review
description: Use before declaring any component done, and before submission, to review permissions, keys, logging, storage, data egress and consent.
---
# Security and privacy review skill

Checklist (report each as pass/fail with evidence):
1. `manifest.json`: permissions minimal; host permissions limited; no `<all_urls>`; no remote code.
2. Search the repo and git history for keys, tokens, `.env` contents. None allowed.
3. Network: the only call carrying personal data is `/stt` with the reply audio. No field value in any request, URL, or log.
4. Server logs: counts, latency, status codes only.
5. Storage: `chrome.storage.session` only; wipe verified on submit, tab close, and idle.
6. Proxy: CORS locked to the extension origin; rate limits and credit cap active.
7. UI: consent banner and live/sample mode banner visible.
8. Data: only synthetic identities anywhere in the repo.
9. Third-party code: list every dependency and why.
10. Write `docs/notes/security-review.md` with the results.
