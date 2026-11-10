---
name: intents-normalizer-comparator
description: Use when implementing or testing reply classification, digit and date normalization, and field comparison in extension/lib.
---
# Intents, normalizer, comparator skill

Implement exactly the spec in `docs/ARCHITECTURE.md` section 8. Plain JS modules, no dependencies, tested with `node --test`.

## Must-pass unit cases
- Devanagari digits: `१२-०३-१९७८` equals `12-03-1978`.
- Same date in `12/03/1978`, `12-03-1978`, `12 Mar 1978` -> match.
- Day and month swapped (`03/12/1978` vs `12/03/1978`) -> mismatch.
- Two-digit year -> `parseDate` returns null -> status `unsure`.
- `500` must not match inside `1500`.
- Name `Sanjay` vs `Sajay` -> mismatch; Latin vs Devanagari -> unsure.
- `classifyReply("nahi, 962081")` -> reject with new_value `962081` only if `962081` is in the transcript.
- `classifyReply("galat hai")` -> reject, new_value null.
- `classifyReply("ek A lagao")` -> correct_instruction, instruction text kept, new_value null.
- `classifyReply("ruko")` -> hold; `classifyReply("")` -> unclear.

## Zero tolerance
A returned `new_value` that is not in the transcript (after normalization) is a bug. Add a property-style test that fuzzes transcripts and asserts this.

## Keep it extendable
Keyword lists live in one data object so recorded friend replies can extend them without code changes.
