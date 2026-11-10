/**
 * Spike 2 Test: Validates WAV packaging calculations and playback sequencing math.
 */

import test from "node:test";
import assert from "node:assert/strict";

function calculateWavHeader(pcmByteLength, sampleRate = 48000, channels = 1, bits = 16) {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmByteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmByteLength, 40);

  return header;
}

test("Spike 2: 48 kHz mono 16-bit WAV header conforms exactly to spec", () => {
  const dummyPcmLen = 96000; // 1 second at 48kHz 16-bit mono
  const hdr = calculateWavHeader(dummyPcmLen);

  assert.equal(hdr.subarray(0, 4).toString(), "RIFF");
  assert.equal(hdr.readUInt32LE(4), 36 + dummyPcmLen);
  assert.equal(hdr.subarray(8, 12).toString(), "WAVE");
  assert.equal(hdr.subarray(12, 16).toString(), "fmt ");
  assert.equal(hdr.readUInt16LE(20), 1, "Format must be PCM (1)");
  assert.equal(hdr.readUInt16LE(22), 1, "Must be mono (1 channel)");
  assert.equal(hdr.readUInt32LE(24), 48000, "Sample rate must be 48,000 Hz");
  assert.equal(hdr.readUInt32LE(28), 96000, "Byte rate must be 96,000 bytes/sec");
  assert.equal(hdr.readUInt16LE(32), 2, "Block align must be 2 bytes");
  assert.equal(hdr.readUInt16LE(34), 16, "Bits per sample must be 16");
  assert.equal(hdr.subarray(36, 40).toString(), "data");
  assert.equal(hdr.readUInt32LE(40), dummyPcmLen);

  console.log("\n[Spike 2 Result]: PASS - WAV header construction verified at 48kHz mono 16-bit.");
});
