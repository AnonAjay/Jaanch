/**
 * Unit Tests for Spelling and Audio Sequencing (tests/unit/spell.test.js)
 * Runnable with: node --test tests/unit/spell.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeNameForReadback, tokenizeDigitsForReadback, tokenizeDateForReadback } from "../../extension/lib/spell.js";

test("tokenizeNameForReadback creates letter clips with 250ms pauses", () => {
  const sequence = tokenizeNameForReadback("SANJAY");
  assert.ok(sequence.length > 0);

  // Check prefix and suffix
  assert.equal(sequence[0].clip, "label_name.wav");
  assert.equal(sequence[sequence.length - 1].clip, "prompt_sahi_hai.wav");

  // Check that letter clips for S, A, N, J, A, Y exist
  const letterClips = sequence.filter(s => s.type === "audio" && s.clip.startsWith("letter_"));
  assert.equal(letterClips.length, 6);
  assert.equal(letterClips[0].clip, "letter_S.wav");
  assert.equal(letterClips[1].clip, "letter_A.wav");
  assert.equal(letterClips[2].clip, "letter_N.wav");
  assert.equal(letterClips[3].clip, "letter_J.wav");
  assert.equal(letterClips[4].clip, "letter_A.wav");
  assert.equal(letterClips[5].clip, "letter_Y.wav");

  // Check 250ms pauses between letters
  const pauses = sequence.filter(s => s.type === "pause" && s.durationMs === 250);
  assert.equal(pauses.length, 5); // 5 pauses between 6 letters
});

test("tokenizeDigitsForReadback groups digits with 400ms pauses", () => {
  const sequence = tokenizeDigitsForReadback("962081");
  const digitClips = sequence.filter(s => s.type === "audio" && s.clip.startsWith("digit_"));
  assert.equal(digitClips.length, 6);

  // 6 digits split into groups of 3 with a 400ms pause
  const groupPauses = sequence.filter(s => s.type === "pause" && s.durationMs === 400);
  assert.ok(groupPauses.length >= 1);
});

test("tokenizeDateForReadback splits day, month, and two-digit year groups", () => {
  const sequence = tokenizeDateForReadback("18/03/1998");
  assert.ok(sequence.length > 0);

  const audioClips = sequence.filter(s => s.type === "audio");
  assert.equal(audioClips[0].clip, "label_dob.wav");
  assert.equal(audioClips[1].clip, "num_18.wav");
  assert.equal(audioClips[2].clip, "month_03.wav");
  assert.equal(audioClips[3].clip, "num_19.wav"); // century
  assert.equal(audioClips[4].clip, "num_98.wav"); // decade
  assert.equal(audioClips[5].clip, "prompt_sahi_hai.wav");
});
