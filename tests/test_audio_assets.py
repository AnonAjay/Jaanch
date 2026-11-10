"""
Unit Tests for Audio Assets & Manifest (tests/test_audio_assets.py)
Validates that all 156 pre-cached audio clips conform to 48 kHz mono 16-bit WAV requirements
and contain zero personal citizen data.
"""

import os
import json
import pytest

from proxy.speech.wav_util import inspect_wav_header

AUDIO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extension", "assets", "audio"))
MANIFEST_PATH = os.path.join(AUDIO_DIR, "manifest.json")


def test_audio_manifest_integrity():
    assert os.path.exists(MANIFEST_PATH), "Audio manifest.json must exist"
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest["format"] == "48000Hz_mono_pcm16_wav"
    assert manifest["sample_rate"] == 48000
    assert manifest["channels"] == 1
    assert manifest["bits_per_sample"] == 16
    assert manifest["total_clips"] == 156
    assert len(manifest["clips"]) == 156


def test_all_156_wav_files_exist_and_conform_to_spec():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    clips = manifest["clips"]

    for filename, meta in clips.items():
        filepath = os.path.join(AUDIO_DIR, filename)
        assert os.path.exists(filepath), f"Audio clip {filename} missing on disk"

        with open(filepath, "rb") as f:
            wav_bytes = f.read()

        sample_rate, channels, bits, duration = inspect_wav_header(wav_bytes)

        assert sample_rate == 48000, f"{filename} has invalid sample rate {sample_rate}"
        assert channels == 1, f"{filename} is not mono"
        assert bits == 16, f"{filename} is not 16-bit"
        assert duration > 0.0, f"{filename} duration is zero"


def test_zero_personal_data_invariant():
    """Verify that no citizen IDs, roll numbers, or personal names exist in audio filenames or manifest."""
    forbidden_terms = ["sanjay", "ajay", "kumar", "anupam", "962081", "aadhaar", "pan"]

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest_str = f.read().lower()

    for term in forbidden_terms:
        assert term not in manifest_str, f"Personal data term '{term}' leaked in audio manifest!"
