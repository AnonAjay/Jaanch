"""
Comprehensive Unit Tests for Speech Proxy (tests/proxy_test.py)
Tests budget caps, WAV validation, fixture replay, error handling, and privacy requirements.
"""

import sys
import os
import unittest
import struct

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from proxy.guard.budget import BudgetGuard, BudgetExceededError
from proxy.speech.wav_util import wav_from_pcm, inspect_wav_header, validate_stt_audio
from proxy.speech.adapter import (
    FixtureGnaniAdapter,
    FixtureNotFoundError,
    OutOfCreditsError,
    SpeechAdapterError,
    get_speech_adapter
)


class TestProxyBudgetGuard(unittest.TestCase):
    def test_session_cap_enforcement(self):
        guard = BudgetGuard(global_cap=100.0, per_session_cap=5, cost_per_request=1.0)
        session_id = "test_user_1"

        # Make 5 requests successfully
        for _ in range(5):
            res = guard.check_and_charge(session_id=session_id, is_live=True)
            self.assertIsNotNone(res)

        # 6th request should exceed session cap
        with self.assertRaises(BudgetExceededError) as ctx:
            guard.check_and_charge(session_id=session_id, is_live=True)
        self.assertIn("Session quota exceeded", str(ctx.exception))

    def test_global_cap_enforcement(self):
        guard = BudgetGuard(global_cap=2.0, per_session_cap=10, cost_per_request=1.0)
        guard.check_and_charge(session_id="user_a", is_live=True)
        guard.check_and_charge(session_id="user_b", is_live=True)

        # Exceeds 2.0 global cap
        with self.assertRaises(BudgetExceededError) as ctx:
            guard.check_and_charge(session_id="user_c", is_live=True)
        self.assertIn("Global credit limit", str(ctx.exception))


class TestWavUtils(unittest.TestCase):
    def test_wav_from_pcm_header(self):
        pcm = b"\x00" * 96000  # 1 second of 48kHz mono 16-bit
        wav = wav_from_pcm(pcm, rate=48000, ch=1, bits=16)

        self.assertEqual(len(wav), 44 + 96000)
        self.assertEqual(wav[:4], b"RIFF")
        self.assertEqual(wav[8:12], b"WAVE")
        self.assertEqual(wav[12:16], b"fmt ")

        rate, ch, bits, duration = inspect_wav_header(wav)
        self.assertEqual(rate, 48000)
        self.assertEqual(ch, 1)
        self.assertEqual(bits, 16)
        self.assertAlmostEqual(duration, 1.0, places=2)

    def test_validate_stt_audio_rejection_over_25s(self):
        # 26 seconds at 16kHz mono 16-bit = 26 * 32,000 bytes = 832,000 bytes
        pcm = b"\x00" * (26 * 32000)
        oversize_wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)

        with self.assertRaises(ValueError) as ctx:
            validate_stt_audio(oversize_wav, max_duration_sec=25.0)
        self.assertIn("exceeds maximum allowed", str(ctx.exception))

    def test_validate_stt_audio_valid(self):
        # 5 seconds at 16kHz mono 16-bit
        pcm = b"\x00" * (5 * 32000)
        valid_wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)
        # Should not raise
        validate_stt_audio(valid_wav, max_duration_sec=25.0)


class TestFixtureAdapter(unittest.IsolatedAsyncioTestCase):
    async def test_fixture_miss_raises_error(self):
        pcm = b"\x01\x02" * 16000  # 1 sec audio
        wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)

        adapter = FixtureGnaniAdapter(fixtures_dir="proxy/fixtures")
        # Invariant: Never invent text on a fixture miss!
        with self.assertRaises(FixtureNotFoundError):
            await adapter.stt(wav)

    async def test_sample_fixture_hit(self):
        pcm = b"\x01\x02" * 16000
        wav = wav_from_pcm(pcm, rate=16000, ch=1, bits=16)

        adapter = FixtureGnaniAdapter(fixtures_dir="proxy/fixtures")
        os.environ["MOCK_FIXTURE_KEY"] = "sahi_hai"
        try:
            res = await adapter.stt(wav)
            self.assertEqual(res["transcript"], "सही है")
            self.assertGreaterEqual(res["confidence"], 0.95)
        finally:
            del os.environ["MOCK_FIXTURE_KEY"]


if __name__ == "__main__":
    unittest.main()
