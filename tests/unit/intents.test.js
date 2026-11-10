/**
 * Unit Tests for Intent Classification & Zero Hallucination Invariant
 * Runnable with: node --test tests/unit/intents.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { classifyReply } from "../../extension/lib/intents.js";
import { devanagariToAscii, normalizeDigits } from "../../extension/lib/normalize.js";

test("classifyReply: Confirmations in Hindi and English", () => {
  const confirms = ["haan", "ha", "ji haan", "sahi hai", "theek hai", "bilkul sahi", "हाँ", "सही है", "yes"];
  for (const text of confirms) {
    const res = classifyReply(text);
    assert.equal(res.intent, "confirm", `"${text}" should be confirm`);
    assert.equal(res.new_value, null);
  }
});

test("classifyReply: Rejection without value", () => {
  const rejects = ["nahi", "galat hai", "sahi nahi hai", "nahi galat", "नहीं", "गलत है"];
  for (const text of rejects) {
    const res = classifyReply(text);
    assert.equal(res.intent, "reject", `"${text}" should be reject`);
    assert.equal(res.new_value, null, `"${text}" should have new_value null`);
  }
});

test("classifyReply: Rejection with numeric correction value", () => {
  const res = classifyReply("nahi, 962081", { targetKind: "digits" });
  assert.equal(res.intent, "reject");
  assert.equal(res.new_value, "962081");

  const resDevanagari = classifyReply("नहीं, ९६२०८१", { targetKind: "digits" });
  assert.equal(resDevanagari.intent, "reject");
  assert.ok(resDevanagari.new_value.includes("962081") || resDevanagari.new_value.includes("९६२०८१"));
});

test("classifyReply: Contrast correction (Sanjay nahi Ajay)", () => {
  const res = classifyReply("Sanjay nahi Ajay", { targetKind: "name" });
  assert.equal(res.intent, "reject");
  assert.equal(res.new_value?.toUpperCase(), "AJAY");
});

test("classifyReply: Instruction-style corrections ('ek A lagao')", () => {
  const res1 = classifyReply("ek A lagao", { targetKind: "name" });
  assert.equal(res1.intent, "correct_instruction");
  assert.equal(res1.new_value, null);
  assert.equal(res1.instruction, "ek A lagao");

  const res2 = classifyReply("A ki jagah E karo", { targetKind: "name" });
  assert.equal(res2.intent, "correct_instruction");
  assert.equal(res2.new_value, null);
  assert.equal(res2.instruction, "A ki jagah E karo");
});

test("classifyReply: Repeat and Hold intents", () => {
  const rep = classifyReply("dobara bolo");
  assert.equal(rep.intent, "repeat");

  const rep2 = classifyReply("phir se");
  assert.equal(rep2.intent, "repeat");

  const hold = classifyReply("ruko");
  assert.equal(hold.intent, "hold");

  const hold2 = classifyReply("ek minute");
  assert.equal(hold2.intent, "hold");
});

test("classifyReply: Empty or unclear transcript", () => {
  assert.equal(classifyReply("").intent, "unclear");
  assert.equal(classifyReply("   ").intent, "unclear");
  assert.equal(classifyReply("random noise bla bla bla").intent, "unclear");
});

test("ZERO TOLERANCE INVARIANT: Extracted new_value MUST appear verbatim in transcript (Fuzz Test)", () => {
  const sampleWords = ["nahi", "sahi", "haan", "ajay", "sanjay", "varanasi", "18", "1998", "962081", "kumar", "singh", "patna", "delhi"];

  // Run 100 randomized synthetic transcripts
  for (let i = 0; i < 100; i++) {
    const len = 1 + Math.floor(Math.random() * 5);
    const tokens = [];
    for (let j = 0; j < len; j++) {
      tokens.push(sampleWords[Math.floor(Math.random() * sampleWords.length)]);
    }
    const transcript = tokens.join(" ");
    const result = classifyReply(transcript);

    if (result.new_value !== null) {
      const normVal = devanagariToAscii(result.new_value).toLowerCase().replace(/[^a-z0-9]/g, "");
      const normTranscript = devanagariToAscii(transcript).toLowerCase().replace(/[^a-z0-9]/g, "");

      const isContained = normTranscript.includes(normVal);
      assert.ok(
        isContained,
        `ZERO TOLERANCE VIOLATION: Extracted value "${result.new_value}" was NOT found verbatim in transcript "${transcript}"!`
      );
    }
  }
});
