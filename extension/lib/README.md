# Jaanch Pure JS Logic Modules (`extension/lib/`)

All modules here are vanilla JavaScript (ES modules) with zero external dependencies, runnable in both the Chrome extension runtime and `node --test` environments.

## Modules

1. **`normalize.js`**:
   - `normalizeDigits(s)`: Maps Devanagari numerals (`०-९`) to ASCII (`0-9`), strips formatting and extra whitespace.
   - `parseDate(s)`: Parses standard Indian date formats (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD Mon YYYY`, Hindi month names). Two-digit years return `null` (strict policy against ambiguity).

2. **`compare.js`**:
   - `compareDates(a, b)`: Compares parsed day, month, and year. Swapped day and month explicitly flags a `mismatch`.
   - `compareDigits(a, b)`: Exact equality after digit normalization.
   - `compareName(a, b)`: Normalizes casing and Unicode NFC. Cross-script comparisons (Latin vs Devanagari) produce `unsure`.

3. **`intents.js`**:
   - `classifyReply(transcript)`: Classifies spoken customer feedback into intents:
     - `confirm`: "haan", "ji", "sahi", "theek", "bilkul"
     - `reject`: "nahi", "galat", "nahi hai"
     - `repeat`: "dobara", "phir se", "kya tha"
     - `hold`: "ruko", "ek minute"
     - `correct_instruction`: "ek A lagao", "Sanjay nahi Ajay"
     - `unclear`: ambiguous or silent responses.
   - **Zero Hallucination Rule**: Any extracted `new_value` MUST be present verbatim in the transcript after normalization.

4. **`spell.js`**:
   - Formats values into sequences of audio tokens (e.g. spelling English names letter-by-letter, breaking numeric sequences into 2-3 digit chunks, date component sequencing).

5. **`audio-player.js`**:
   - Coordinates Web Audio API playback of pre-cached audio clips (`extension/assets/audio/`) with visual highlight synchronizations.

6. **`vad.js`**:
   - Voice Activity Detection using Web Audio AnalyserNode to measure decibel loudness against a configurable threshold to drive UI waveforms and detect speech end.
