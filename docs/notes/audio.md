# Audio Assets Component Notes (`extension/assets/audio/`)

## Plain Language Overview
Spoken readback uses 156 pre-generated, static audio clips cached directly inside the Chrome extension. Reading field values emits zero network traffic and zero personal data, achieving instant (0ms) read-back latency.

## Clip Catalog (156 Files)
- Letters A–Z (`letter_A.wav` .. `letter_Z.wav`): 26 files for letter-by-letter spelling.
- Numbers 00–99 (`num_00.wav` .. `num_99.wav`): 100 Hindi word clips for days and two-digit year pairs.
- Digits 0–9 (`digit_0.wav` .. `digit_9.wav`): 10 clips for application and token numbers.
- Months 01–12 (`month_01.wav` .. `month_12.wav`): 12 Hindi month name clips.
- Labels & Prompts: 8 clips for field labels and confirmation prompts ("Sahi hai?").

## Key Invariants Enforced
- **Zero Personal Data**: Only dictionary tokens are generated—never citizen names or ID numbers.
- **Specification**: 48,000 Hz, mono, 16-bit PCM RIFF WAV format.
- **Manifest**: Complete index with byte size and duration maintained in `manifest.json`.
