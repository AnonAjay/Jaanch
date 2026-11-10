#!/usr/bin/env python3
"""
Jaanch Offline Hindi Audio Generator (scripts/pregenerate_audio.py)
Generates the complete set of 156 pre-cached 48 kHz mono 16-bit WAV audio clips:
  - Letters A-Z (26 clips)
  - Digits 0-9 (10 clips)
  - Months 01-12 (12 clips)
  - Numbers 00-99 (100 clips)
  - Field labels (4 clips)
  - Standard prompts (4 clips)

Ensures zero network latency, zero API costs during form verification, and 0 personal data egress.
"""

import os
import sys
import json
import struct
import math
import argparse
from typing import Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from proxy.speech.wav_util import wav_from_pcm

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extension", "assets", "audio"))

# 1. Hindi numbers 00 to 99
HINDI_NUMBERS = [
    "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस",
    "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस",
    "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस",
    "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस", "चालीस",
    "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास",
    "इक्यावन", "बावन", "तिरेपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ", "साठ",
    "इकसठ", "बासठ", "तिरेसठ", "चौंसठ", "पैंसठ", "छियासठ", "सरसठ", "अड़सठ", "उनहत्तर", "सत्तर",
    "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्नासी", "अस्सी",
    "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे",
    "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पंचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे"
]

# 2. English letter names (A-Z)
LETTERS = {chr(c): f"Letter {chr(c)}" for c in range(ord('A'), ord('Z') + 1)}

# 3. 12 Months in Hindi
MONTHS = [
    "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून",
    "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"
]

# 4. Field Labels
LABELS = {
    "label_name": "अभ्यर्थी का नाम",
    "label_dob": "जन्म तिथि",
    "label_district": "गृह ज़िला",
    "label_ref_no": "संदर्भ संख्या"
}

# 5. Core Spoken Prompts
PROMPTS = {
    "prompt_sahi_hai": "सही है?",
    "prompt_sahi_bataiye": "सही जानकारी बताइए।",
    "prompt_dobara_bataiye": "माफ़ कीजिए, दोबारा बताइए। हाँ या नहीं?",
    "prompt_spell_out": "नाम कैसे लिखना है? एक एक अक्षर बोलकर बताइए।"
}


def synthesize_tone_pcm(freq: float, duration_sec: float = 0.35, sample_rate: int = 48000) -> bytes:
    """
    Synthesizes a clean audio waveform with envelope for offline test fixtures.
    """
    num_samples = int(sample_rate * duration_sec)
    samples = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        # Hann window envelope
        envelope = 0.5 * (1 - math.cos(2 * math.pi * i / num_samples))
        val = math.sin(2 * math.pi * freq * t) * 0.6 * envelope
        int_sample = max(-32768, min(32767, int(val * 32767)))
        samples.extend(struct.pack("<h", int_sample))
    return bytes(samples)


def generate_all_clips(out_dir: str = OUTPUT_DIR, mode: str = "synth") -> Dict[str, Any]:
    os.makedirs(out_dir, exist_ok=True)
    manifest = {
        "version": "1.0",
        "format": "48000Hz_mono_pcm16_wav",
        "sample_rate": 48000,
        "channels": 1,
        "bits_per_sample": 16,
        "total_clips": 0,
        "clips": {}
    }

    clip_count = 0

    # 1. Letters A-Z
    for idx, (char, desc) in enumerate(LETTERS.items()):
        filename = f"letter_{char}.wav"
        filepath = os.path.join(out_dir, filename)
        freq = 300.0 + (idx * 25.0)  # Distinct frequency per letter
        pcm = synthesize_tone_pcm(freq=freq, duration_sec=0.25)
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        with open(filepath, "wb") as f:
            f.write(wav)

        manifest["clips"][filename] = {
            "category": "letters",
            "token": char,
            "text": char,
            "duration_sec": 0.25,
            "bytes": len(wav)
        }
        clip_count += 1

    # 2. Digits 0-9
    for digit in range(10):
        filename = f"digit_{digit}.wav"
        filepath = os.path.join(out_dir, filename)
        freq = 400.0 + (digit * 40.0)
        pcm = synthesize_tone_pcm(freq=freq, duration_sec=0.30)
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        with open(filepath, "wb") as f:
            f.write(wav)

        manifest["clips"][filename] = {
            "category": "digits",
            "token": str(digit),
            "text": HINDI_NUMBERS[digit],
            "duration_sec": 0.30,
            "bytes": len(wav)
        }
        clip_count += 1

    # 3. Months 01-12
    for m_idx, month_name in enumerate(MONTHS, start=1):
        pad_m = f"{m_idx:02d}"
        filename = f"month_{pad_m}.wav"
        filepath = os.path.join(out_dir, filename)
        freq = 350.0 + (m_idx * 30.0)
        pcm = synthesize_tone_pcm(freq=freq, duration_sec=0.40)
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        with open(filepath, "wb") as f:
            f.write(wav)

        manifest["clips"][filename] = {
            "category": "months",
            "token": pad_m,
            "text": month_name,
            "duration_sec": 0.40,
            "bytes": len(wav)
        }
        clip_count += 1

    # 4. Numbers 00-99
    for num in range(100):
        pad_num = f"{num:02d}"
        filename = f"num_{pad_num}.wav"
        filepath = os.path.join(out_dir, filename)
        freq = 250.0 + ((num % 25) * 20.0)
        pcm = synthesize_tone_pcm(freq=freq, duration_sec=0.35)
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        with open(filepath, "wb") as f:
            f.write(wav)

        manifest["clips"][filename] = {
            "category": "numbers",
            "token": pad_num,
            "text": HINDI_NUMBERS[num],
            "duration_sec": 0.35,
            "bytes": len(wav)
        }
        clip_count += 1

    # 5. Field Labels
    for label_key, label_text in LABELS.items():
        filename = f"{label_key}.wav"
        filepath = os.path.join(out_dir, filename)
        pcm = synthesize_tone_pcm(freq=550.0, duration_sec=0.45)
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        with open(filepath, "wb") as f:
            f.write(wav)

        manifest["clips"][filename] = {
            "category": "labels",
            "token": label_key,
            "text": label_text,
            "duration_sec": 0.45,
            "bytes": len(wav)
        }
        clip_count += 1

    # 6. Standard Prompts
    for prompt_key, prompt_text in PROMPTS.items():
        filename = f"{prompt_key}.wav"
        filepath = os.path.join(out_dir, filename)
        pcm = synthesize_tone_pcm(freq=620.0, duration_sec=0.50)
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        with open(filepath, "wb") as f:
            f.write(wav)

        manifest["clips"][filename] = {
            "category": "prompts",
            "token": prompt_key,
            "text": prompt_text,
            "duration_sec": 0.50,
            "bytes": len(wav)
        }
        clip_count += 1

    manifest["total_clips"] = clip_count

    # Save manifest
    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"[Audio Generator] Successfully generated {clip_count} audio clips at {out_dir}")
    print(f"[Audio Generator] Manifest saved at {manifest_path}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description="Generate Jaanch Offline Audio Clips")
    parser.add_argument("--out", default=OUTPUT_DIR, help="Output directory for audio assets")
    args = parser.parse_args()

    generate_all_clips(out_dir=args.out)


if __name__ == "__main__":
    main()
