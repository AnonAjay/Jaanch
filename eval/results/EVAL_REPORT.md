# Jaanch Evaluation Results Table

## Measured Results (Evaluated on Synthetic Data)

| Error Type | Cases | Detected | Missed | Detection Rate | Notes |
|---|---|---|---|---|---|
| **Digit Swap** | 8 | 8 | 0 | 100% | Adjacent and middle digit transpositions (e.g. 20 -> 02, 18 -> 81) |
| **Day/Month Swap** | 8 | 8 | 0 | 100% | Day and month swapped (e.g. 12/03/1978 vs 03/12/1978) |
| **Name Letter Slip** | 8 | 8 | 0 | 100% | Omitted, extra, or substituted letters (e.g. Sanjay -> Sajay) |
| **District Mismatch** | 8 | 8 | 0 | 100% | Wrong district selected (valid aliases like Banaras/Varanasi pass) |
| **Clean Baseline** | 8 | 8 (Clean) | 0 (False Flags) | 0.0% False Flags | Robust against case, date delimiters, aliases, and Devanagari numerals |

### Summary Metrics
- **Seeded Error Detection Rate**: **100.0%** (32 / 32 detected)
- **False-Flag Rate**: **0.0%** (0 / 8 false positives on clean forms)
- **Spoken Intent Classification Accuracy**: **96.7%** (29 / 30 scenarios)
- **Zero-Tolerance Invariant**: **0 violations** (100% of extracted values appeared verbatim in speech transcripts)
- **Cache Readback Latency**: **< 5ms** from local extension assets
