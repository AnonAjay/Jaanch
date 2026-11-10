/**
 * Jaanch Audio Sequencing & Spelling Formatter (extension/lib/spell.js)
 * Formats field values into sequences of audio tokens with exact pause durations.
 * Zero external dependencies.
 */

import { devanagariToAscii, normalizeDigits, parseDate } from "./normalize.js";

/**
 * Token types:
 *  - "audio": references an audio clip filename in extension/assets/audio/
 *  - "pause": pause duration in milliseconds
 *  - "highlight": marks a visual UI element to highlight (e.g. letter index)
 */

export function tokenizeNameForReadback(name) {
  if (!name || typeof name !== "string") return [];

  const cleanName = name.replace(/[^A-Za-z]/g, "").toUpperCase();
  const sequence = [];

  // Prefix prompt: "label_name.wav"
  sequence.push({ type: "audio", clip: "label_name.wav" });
  sequence.push({ type: "pause", durationMs: 300 });

  for (let i = 0; i < cleanName.length; i++) {
    const char = cleanName[i];
    sequence.push({
      type: "audio",
      clip: `letter_${char}.wav`,
      char,
      charIndex: i
    });

    // 250 ms pause between letters
    if (i < cleanName.length - 1) {
      sequence.push({ type: "pause", durationMs: 250 });
    }
  }

  // Suffix question: "prompt_sahi_hai.wav"
  sequence.push({ type: "pause", durationMs: 350 });
  sequence.push({ type: "audio", clip: "prompt_sahi_hai.wav" });

  return sequence;
}

export function tokenizeDigitsForReadback(digitString) {
  const norm = normalizeDigits(digitString);
  if (!norm) return [];

  const sequence = [];
  sequence.push({ type: "audio", clip: "label_ref_no.wav" });
  sequence.push({ type: "pause", durationMs: 300 });

  // Break into groups of 2 or 3
  // e.g. 6-digit number -> two groups of 3 (962, 081)
  const groupSize = norm.length % 2 === 0 && norm.length <= 4 ? 2 : 3;

  for (let i = 0; i < norm.length; i++) {
    const digit = norm[i];
    sequence.push({
      type: "audio",
      clip: `digit_${digit}.wav`,
      digit,
      digitIndex: i
    });

    if ((i + 1) % groupSize === 0 && i < norm.length - 1) {
      // 400ms pause between digit groups
      sequence.push({ type: "pause", durationMs: 400 });
    } else if (i < norm.length - 1) {
      sequence.push({ type: "pause", durationMs: 150 });
    }
  }

  sequence.push({ type: "pause", durationMs: 350 });
  sequence.push({ type: "audio", clip: "prompt_sahi_hai.wav" });

  return sequence;
}

export function tokenizeDateForReadback(dateStr) {
  const parsed = parseDate(dateStr);
  if (!parsed) return [];

  const sequence = [];
  sequence.push({ type: "audio", clip: "label_dob.wav" });
  sequence.push({ type: "pause", durationMs: 300 });

  // 1. Day (e.g. 18 -> num_18.wav)
  const padDay = String(parsed.day).padStart(2, "0");
  sequence.push({ type: "audio", clip: `num_${padDay}.wav`, text: String(parsed.day) });
  sequence.push({ type: "pause", durationMs: 250 });

  // 2. Month (e.g. 03 -> month_03.wav)
  const padMonth = String(parsed.month).padStart(2, "0");
  sequence.push({ type: "audio", clip: `month_${padMonth}.wav`, text: String(parsed.month) });
  sequence.push({ type: "pause", durationMs: 250 });

  // 3. Year as two 2-digit groups: e.g. 1978 -> 19 | 78
  const yearStr = String(parsed.year);
  const century = yearStr.slice(0, 2);
  const decade = yearStr.slice(2, 4);

  sequence.push({ type: "audio", clip: `num_${century}.wav`, text: century });
  sequence.push({ type: "pause", durationMs: 300 });
  sequence.push({ type: "audio", clip: `num_${decade}.wav`, text: decade });

  sequence.push({ type: "pause", durationMs: 350 });
  sequence.push({ type: "audio", clip: "prompt_sahi_hai.wav" });

  return sequence;
}
