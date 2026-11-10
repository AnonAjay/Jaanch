---
name: hindi-readback-audio
description: Use when designing spoken prompts, the cached audio clip set, spelled-out names, digit grouping, date reading, and the large-text read-back UI.
---
# Hindi read-back and audio assets skill

A native Hindi speaker must review every prompt and clip before the demo. The Roman transliterations below are drafts.

## Rules
- Name the field and the value every time. Never "this", "that", "or", "same".
- Names: spell letter by letter (clips A to Z), 250 ms pauses, highlight each letter as it plays.
- Digit strings: groups of 2 or 3 with 400 ms pauses. Amounts: whole numbers.
- Dates: day clip, month clip, year as two 2-digit groups (19 | 78).
- One question per field, then one listening window.

## Draft templates (Roman Hindi)
- Name: "Naam. A, N, U, P, A, M. Sahi hai?"
- Date: "Janm tithi. Baarah, maarch, unnees, athattar. Sahi hai?"
- Digits: "Number. Nau, chhah, do. Zero, ek, aath. Sahi hai?"
- Reject without value: "Sahi {field} bataiye."
- Name correction: "Naam kaise likhna hai? Ek ek akshar bolkar bataiye."
- Unclear: "Maaf kijiye, dobara bataiye. Haan ya nahi?"
- Repeat: replay the same prompt.

## Clip set (generate once, `scripts/pregenerate_audio.py`)
Numbers 00 to 99, letters A to Z, digits 0 to 9, 12 months, field labels, the prompts above. Name files `num_07.wav`, `letter_A.wav`, `month_03.wav`, `phrase_sahi_hai.wav`. Write a `manifest.json` listing every clip. 48 kHz mono WAV. Never generate a clip containing personal data.

## UI
Value in at least 40 px, spelled letters beneath with highlight, works at 200 percent zoom.

## Check
Gnani terms on caching and shipping generated audio. If not allowed, use a free local TTS for the clips and record that in `docs/DECISIONS.md`.
