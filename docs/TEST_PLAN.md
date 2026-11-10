# Test plan (all data synthetic)

## A. Seeded-error form cases (target 40)
Each case: a mock form filled from a fake identity card plus ONE seeded error. Types (about 8 each): digit swap, day/month swap, one missing or extra letter in a name, wrong district, correct form (no error, to measure false flags).
Report per type: cases, detected, missed, with counts.

## B. Spoken replies (target 30)
Plain yes, plain no, "galat hai" with no value, correction with a value, Hinglish reply, "dobara bolo", "ruko", value spoken digit by digit, instruction-style reply ("ek A lagao"), noise or silence. Record with consent using fake details, or synthesize and mix in noise at 20, 10, 5, 0 dB SNR.
Report: intent accuracy, how many handled by rules, how many marked `unclear` instead of guessed.

## C. Hard pass line (zero tolerance)
No returned `new_value` that is not present (after normalization) in the transcript. One violation fails the build.

## D. Log context for every human trial
Time of day, how busy, whether the volunteer could read the screen, noise level. Report ranges with sample size; label as a pilot on friends, not real customers.

## E. Set your own pass lines BEFORE looking at results
Write them in docs/DECISIONS.md. Do not move them afterwards.

## F. Results table format (copy into README)
| Error type | Cases | Detected | Missed | Notes |
