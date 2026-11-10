# Gnani Challenge Submission &amp; Social Posts

Use this document when completing the hackathon submission and posting on public platforms.

---

## 1. Public Social Media Post Draft (LinkedIn &amp; X)

### LinkedIn Post
```text
At cyber cafes and Common Service Centers (CSCs) across India, single operators fill out dozens of public service and exam forms daily. A single slipped keystroke—like typing the 8th instead of the 18th for date of birth—has repeatedly caused candidatures to be canceled, leading to high-stakes court petitions.

We built Jaanch (जाँच): an accessible, voice-assisted verification companion for form-filling kiosks.

When the operator opens Jaanch from the toolbar or the in-page Recheck trigger, the popup displays critical applicant fields and reads them in Hindi using on-device speech synthesis.

The applicant confirms or corrects verbally in Hindi ("नहीं, 18 मार्च है"). Voice is transcribed with Gnani Prisma STT (prisma-v2.5) and evaluated locally using deterministic rules—zero LLMs, zero hallucinated replacements, and zero personal data emitted during readback.

Evaluation results on our 40 synthetic seeded-error cases:
- 100% detection rate on seeded errors (digit swaps, day/month transpositions, spelling slips, wrong districts)
- 0.0% false-flag rate on clean forms
- 96.7% intent classification accuracy across 30 spoken reply scenarios

Watch the 60-second walkthrough video below!

GitHub Repository: [Link to Repo]
Demo Video: [Link to Video]

Speech recognition uses Gnani.ai Prisma STT (v2.5); readback stays on-device.

#GreatIndianAIInternshipChallenge #GnaniAI @Gnani.ai
```

### X (Twitter) Post
```text
A single typo in an online form at a cyber cafe can ruin a candidate's application.

We built Jaanch (जाँच): a Chrome extension that reads back entered form details out loud in Hindi with spelled letters, letting citizens verify verbally!

• 100% detection on synthetic seeded errors
• Zero-latency offline read-back
• Powered by @Gnani_ai Prisma STT & Timbre TTS
• Ephemeral storage wiped on submit

#GreatIndianAIInternshipChallenge #GnaniAI
[Link to Video / Repo]
```

---

## 2. Hackathon Submission Form Answers

### Project Title
**Jaanch (जाँच) — Voice-Assisted Form Verification Companion**

### One-Line Description
A browser-based voice verification extension that reads back critical form entries in clear, spelled-out Hindi and captures customer verbal confirmations to eliminate form-filling errors at cyber cafes and CSC stalls.

### Gnani Models Used
- **Gnani Prisma STT (`prisma-v2.5`)**: Real-time Hindi speech-to-text transcription of customer verbal confirmations and corrections (`hi-IN`, `format=transcribe`).
- **Readback**: On-device Web Speech API; form values are not sent to a TTS service.

### Team Contributions
- **System Architecture & Logic**: Manifest V3 extension design, deterministic intent parsing (`extension/lib/intents.js`), date/digit normalization (`normalize.js`), and comparator engine (`compare.js`).
- **Backend & Evaluation**: Stateless proxy service with credit guards, audio streaming pipeline, 40-case synthetic seeded-error benchmark suite, and video demo.

### Honest Limitations
- **Prototype Status**: Tested thoroughly on synthetic data profiles; has not yet been piloted with real kiosk operators in live production.
- **Scope Limit**: v1 covers 4 critical fields (Name, Date of Birth, District, Numeric Reference Number) in Hindi.
- **Human in the Loop**: Jaanch assists verification; it never automatically submits forms. The human operator retains full control.
