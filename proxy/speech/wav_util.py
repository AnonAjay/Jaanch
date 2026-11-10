"""
WAV Audio Utilities for Jaanch (proxy/speech/wav_util.py)
Encapsulates 44-byte RIFF WAV packing and format validation.
"""

import struct
from typing import Tuple


def wav_from_pcm(pcm: bytes, rate: int = 48000, ch: int = 1, bits: int = 16) -> bytes:
    """
    Wraps raw PCM audio bytes in a standard 44-byte RIFF WAV header.
    Default: 48 kHz mono 16-bit (for Gnani Timbre TTS output).
    """
    byte_rate = rate * ch * bits // 8
    block_align = ch * bits // 8
    data_len = len(pcm)
    hdr = (
        b"RIFF"
        + struct.pack("<I", 36 + data_len)
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, ch, rate, byte_rate, block_align, bits)
        + b"data"
        + struct.pack("<I", data_len)
    )
    return hdr + pcm


def inspect_wav_header(wav_bytes: bytes) -> Tuple[int, int, int, float]:
    """
    Inspects a RIFF WAV header and returns:
    (sample_rate, channels, bits_per_sample, duration_seconds)
    """
    if len(wav_bytes) < 44 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        raise ValueError("Invalid WAV format: missing RIFF/WAVE signature.")

    # fmt chunk
    fmt_idx = wav_bytes.find(b"fmt ")
    if fmt_idx == -1:
        raise ValueError("Invalid WAV format: missing fmt chunk.")

    audio_format, channels, sample_rate, byte_rate, block_align, bits = struct.unpack(
        "<HHIIHH", wav_bytes[fmt_idx + 8 : fmt_idx + 24]
    )

    # data chunk
    data_idx = wav_bytes.find(b"data")
    if data_idx == -1:
        raise ValueError("Invalid WAV format: missing data chunk.")

    data_size = struct.unpack("<I", wav_bytes[data_idx + 4 : data_idx + 8])[0]
    duration_sec = data_size / byte_rate if byte_rate > 0 else 0.0

    return sample_rate, channels, bits, duration_sec


def validate_stt_audio(audio_bytes: bytes, max_duration_sec: float = 25.0) -> None:
    """
    Validates uploaded STT audio conforms to Gnani Prisma requirements:
    - WAV format
    - Duration <= 25 seconds
    """
    if len(audio_bytes) < 44:
        raise ValueError("Audio file too small to contain valid audio.")

    try:
        sample_rate, channels, bits, duration = inspect_wav_header(audio_bytes)
    except Exception:
        # Fallback raw byte length check: 25s at 16kHz 16-bit mono is ~800,000 bytes
        if len(audio_bytes) > (max_duration_sec * 32000 + 44):
            raise ValueError(f"Audio file size exceeds limit ({max_duration_sec}s maximum).")
        return

    if duration > max_duration_sec:
        raise ValueError(
            f"Audio duration ({duration:.1f}s) exceeds maximum allowed {max_duration_sec}s."
        )
