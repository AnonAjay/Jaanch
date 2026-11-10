---
description: Run the four Gate A spikes and report pass/fail with evidence
---
1. Read docs/ARCHITECTURE.md sections 1, 2, 12.
2. In spikes/, build: (a) content script reads the mock form, (b) side panel plays a saved clip, (c) mic capture inside the extension, (d) proxy /health reachable from the extension.
3. Report each as PASS/FAIL with evidence (logs, screenshots).
4. If (c) fails after trying the permissions-page workaround, recommend the fallback in section 14 and stop.
5. Update .agents/memory/STATE.md.
