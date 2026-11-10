/**
 * Spike 3 Test: Validates 16 kHz downsampling and WAV structure.
 */

import test from "node:test";
import assert from "node:assert/strict";

function downsampleTo16k(inputData, inputSampleRate) {
  if (inputSampleRate === 16000) return inputData;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;
  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0, count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < inputData.length; i++) {
      accum += inputData[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

function encode16kWavBuffer(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(16000, 24); // 16 kHz
  buffer.writeUInt32LE(32000, 28); // byte rate = 16000 * 2
  buffer.writeUInt16LE(2, 32);  // block align
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int16 = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7FFF);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  return buffer;
}

test("Spike 3: Downsamples 48kHz input to 16kHz and encodes valid 16kHz WAV", () => {
  // 1 second of 48kHz audio (48,000 samples)
  const input48k = new Float32Array(48000);
  for (let i = 0; i < input48k.length; i++) {
    input48k[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
  }

  const resampled16k = downsampleTo16k(input48k, 48000);
  assert.equal(resampled16k.length, 16000, "1 second at 48kHz must downsample to exactly 16,000 samples at 16kHz");

  const wavBuf = encode16kWavBuffer(resampled16k);
  assert.equal(wavBuf.readUInt32LE(24), 16000, "Sample rate in WAV header must be 16,000");
  assert.equal(wavBuf.readUInt16LE(22), 1, "Must be mono (1 channel)");
  assert.equal(wavBuf.readUInt16LE(34), 16, "Must be 16-bit PCM");
  assert.equal(wavBuf.readUInt32LE(40), 32000, "Data size must be 32,000 bytes (16,000 samples * 2 bytes)");

  console.log("\n[Spike 3 Result]: PASS - 16kHz downsampling and WAV encoding verified.");
});
