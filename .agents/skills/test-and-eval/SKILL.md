---
name: test-and-eval
description: Use when building the synthetic eval set, running seeded-error tests, mixing noise, logging human trials, and producing the results table for the README.
---
# Test and eval skill

Follow `docs/TEST_PLAN.md`.

- Fake identities only; each case has exactly one seeded error or none.
- Runner prints the results table per error type with counts, plus false-flag rate and intent accuracy.
- Noise mixing (optional): mix clean speech with recorded ambient noise at 20, 10, 5, 0 dB SNR; report per level.
- Zero-tolerance check: no `new_value` outside the transcript.
- Record mode saves real API responses; fixture mode replays them so the eval costs no credits.
- Pass lines are written in `docs/DECISIONS.md` BEFORE running and never moved.
- Human trials: log time of day, how busy, whether the volunteer could read the screen, noise level. Report ranges and sample size, labelled as a pilot on friends.
- Output a Markdown table and a JSON file in `eval/results/`.
