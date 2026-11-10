/**
 * Utility to generate a valid 48 kHz 16-bit mono PCM WAV file for Spike 2.
 */

import fs from "node:fs";
import path from "node:path";

export function createWavBuffer({ sampleRate = 48000, durationSeconds = 0.5, frequency = 440 }) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate sine wave samples
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Fade in/out to prevent clicks
    const envelope = Math.sin((Math.PI * i) / numSamples);
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.7 * envelope;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

// Generate sample.wav if run directly
const outPath = path.resolve("spikes", "sample.wav");
const wav = createWavBuffer({ sampleRate: 48000, durationSeconds: 0.4, frequency: 523.25 }); // C5 note
fs.writeFileSync(outPath, wav);
console.log(`[Spike 2 Asset] Generated test WAV at ${outPath} (${wav.length} bytes, 48 kHz mono 16-bit)`);
