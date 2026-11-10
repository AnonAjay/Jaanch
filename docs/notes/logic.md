# Logic Component Notes (`extension/lib/`)

## Plain Language Overview
The logic component runs entirely client-side without external dependencies. It normalizes text, parses dates and numbers, deterministically compares entered fields against citizen statements, and classifies customer speech.

## Data Flow
```
Customer Speech Transcript -> intents.js -> {intent, new_value, instruction}
Form Field Value + Extracted Value -> normalize.js -> compare.js -> {status: match|mismatch|unsure}
Form Field Value -> spell.js -> [{clip, pause, highlight}] -> audio playback
```

## Key Invariants Enforced
- **Zero Hallucination**: Any extracted replacement value MUST be found verbatim in the transcript.
- **Strict Dates**: Day/month swap explicitly flags a mismatch; 2-digit years return `null` (unsure).
- **Pure JavaScript**: ES modules runnable in both Chrome extensions and `node --test`.
