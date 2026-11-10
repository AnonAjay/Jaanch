# 60-Second Demo Video Script & Shot List

Designed strictly according to the Gnani Challenge guidelines (`demo-and-submission` skill).

---

## Shot List (Total Runtime: 60 Seconds)

| Timestamp | Shot Type | Visual Description | Audio / Voiceover Track |
|---|---|---|---|
| **00:00 – 00:08** | **[STAGED]** Dramatization | Over-the-shoulder shot at a busy cyber cafe counter. Candidate sits beside the operator looking confused at the small, cluttered form on screen. <br>*On-screen subtitle: "DRAMATIZATION"* | *"At cyber cafes across India, operators type dozens of critical exam forms daily. A single slipped keystroke in a birth date or spelling can get an application rejected."* |
| **00:08 – 00:15** | **[REAL]** Screen Recording | Operator on the mock portal fills candidate details (`SANJAY KUMAR`, `03/12/1978` instead of `12/03/1978`). Operator clicks the injected **"Recheck with Jaanch (जाँच)"** button. | *"Introducing Jaanch: Voice-assisted form verification right in the browser."* |
| **00:15 – 00:25** | **[REAL]** Screen Recording | Chrome Side Panel opens. Large 40px text displays name `SANJAY`. Jaanch reads aloud in Hindi while letters highlight in real-time: `S - A - N - J - A - Y`. | *(Computer audio): "अभ्यर्थी का नाम: S... A... N... J... A... Y. सही है?"* <br>*(Voiceover): "Zero-latency offline read-back spells names letter-by-letter with instant visual highlighting."* |
| **00:25 – 00:35** | **[REAL]** Screen Recording | Side panel advances to Date of Birth (`03/12/1978`). Audio reads: *"जन्म तिथि: तीन, दिसंबर, उन्नीस, अठहत्तर। सही है?"* Candidate responds: *"नहीं, बारह मार्च है"*. Live waveform visualizer reacts in green. | *(Candidate voice): "नहीं, बारह मार्च है"* <br>*(Voiceover): "The customer responds verbally in Hindi. Speech is transcribed via Gnani Prisma v2.5."* |
| **00:35 – 00:46** | **[REAL]** Screen Recording | Deterministic comparator catches the day/month swap! Side panel displays red **MISMATCH** status chip. Candidate's heard correction is extracted. Operator clicks **[Accept Correction]**. Value updates to `12/03/1978`. | *(Voiceover): "Deterministic rules flag the mismatch instantly without LLM hallucination. The operator retains full control to accept or keep."* |
| **00:46 – 00:54** | **[REAL]** Text Card | Clean high-contrast card: <br>**Jaanch (जाँच)**<br>• Prototype tested on synthetic data<br>• Zero personal data emitted during readback<br>• Ephemeral storage wiped on submit | *(Voiceover): "Tested with 100% detection on synthetic error sets, keeping citizen data strictly private."* |
| **00:54 – 01:00** | **[REAL]** Closing Card | Logos & Title Card: <br>**Jaanch — Built with Gnani AI**<br>Powered by Prisma STT &amp; Timbre TTS<br>`#GreatIndianAIInternshipChallenge` `#GnaniAI` | Music swell / fade out. |

---

## Submission Video Checklist
- [x] Runtime exactly $\le$ 60 seconds
- [x] Clear demarcation between staged intro dramatization and real UI recording
- [x] Real screen recording showing actual working side panel, speech waveform, and operator decision buttons
- [x] Transparent disclaimer on prototype status and synthetic data
- [x] Proper hashtags displayed: `#GreatIndianAIInternshipChallenge` and `#GnaniAI`
