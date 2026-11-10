# Jaanch Evaluation Suite

Based on `docs/TEST_PLAN.md` and the `test-and-eval` skill.

## Dataset Structure

1. **`cases/` (Target: 40 synthetic form cases)**
   - Synthetic candidate profile + ONE seeded error (or zero errors for false-flag measurement).
   - Categories:
     - Digit swap
     - Day/month swap
     - Character edit/slip in name
     - District mismatch
     - Clean/correct baseline

2. **`replies/` (Target: 30 spoken reply scenarios)**
   - Transcripts & audio fixtures:
     - Plain affirmative: "Haan", "Sahi hai", "Theek hai"
     - Rejection without value: "Galat hai", "Nahi"
     - Rejection with value: "Nahi, 18 March hai", "Nahi 962081"
     - Hinglish: "Correct nahi hai, Sanjay nahi Ajay"
     - Instruction: "Ek A extra lag gaya"
     - Hold / Repeat: "Ruko", "Dobara bolo"
     - Noise / Silence

3. **`results/`**
   - Stores markdown and JSON evaluation runs.
