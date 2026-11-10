/**
 * Jaanch Spoken Intent Classification (extension/lib/intents.js)
 * Deterministic, rule-based classifier with ZERO hallucination invariant.
 * Zero external dependencies.
 */

import { devanagariToAscii, normalizeDigits } from "./normalize.js";

/**
 * Extendable intent keyword tables.
 */
export const INTENT_KEYWORDS = {
  confirm: [
    "haan", "ha", "haa", "han", "ji haan", "ji", "sahi hai", "sahi", "theek hai", "theek",
    "thik hai", "thik", "bilkul sahi", "bilkul", "yes", "correct", "right", "okay", "ok",
    "हाँ", "हा", "जी हाँ", "जी", "सही है", "सही", "ठीक है", "ठीक", "बिल्कुल सही", "बिल्कुल"
  ],
  reject: [
    "nahi", "nahin", "na", "galat hai", "galat", "sahi nahi", "no", "wrong", "incorrect",
    "नहीं", "ना", "गलत है", "गलत", "सही नहीं"
  ],
  repeat: [
    "dobara", "phir se", "fir se", "kya tha", "repeat", "once more", "ek baar aur",
    "दोबारा", "फिर से", "क्या था", "एक बार फिर"
  ],
  hold: [
    "ruko", "ruk jao", "ek minute", "wait", "hold", "ek second",
    "रुको", "रुक जाओ", "एक मिनट", "ठहरो"
  ],
  instruction_triggers: [
    "lagao", "hatao", "badlo", "jodo", "ki jagah", "spelling", "add", "remove", "replace",
    "लगाओ", "हटाओ", "बदलो", "जोड़ो", "की जगह"
  ]
};

const STOP_WORDS = new Set([
  "hai", "hain", "tha", "thi", "the", "bhai", "ji", "sahab", "ye", "wo", "karo", "kijiye",
  "naam", "district", "number", "dob", "sir", "madam", "it", "is",
  "galat", "sahi", "nahi", "nahin", "wrong", "right", "incorrect", "correct",
  "है", "हैं", "था", "थी", "थे", "जी", "भाई", "साहब", "ये", "वो", "करो", "कीजिए", "नाम", "गलत", "सही", "नहीं"
]);

/**
 * Checks if text contains any of the given keywords as standalone words or phrases.
 */
function containsKeyword(text, keywords) {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[\\s,.;:!?])${escaped}([\\s,.;:!?]|$)`, "i");
    if (regex.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes text for search and verbatim substring checks.
 */
function normalizeForSearch(str) {
  if (!str) return "";
  return devanagariToAscii(str)
    .toLowerCase()
    .normalize("NFC")
    .replace(/[,\.\-\/\\:;!?'"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classifies customer spoken transcript into an actionable intent structure.
 */
export function classifyReply(rawTranscript, options = {}) {
  const transcript = (rawTranscript || "").trim();
  const targetField = options.targetField || null;
  const targetKind = options.targetKind || null;

  if (!transcript) {
    return {
      intent: "unclear",
      new_value: null,
      instruction: null,
      target_field: targetField,
      raw_transcript: ""
    };
  }

  const normSearchText = normalizeForSearch(transcript);

  // 1. Check for Hold
  if (containsKeyword(normSearchText, INTENT_KEYWORDS.hold)) {
    return {
      intent: "hold",
      new_value: null,
      instruction: null,
      target_field: targetField,
      raw_transcript: transcript
    };
  }

  // 2. Check for Repeat
  if (containsKeyword(normSearchText, INTENT_KEYWORDS.repeat)) {
    return {
      intent: "repeat",
      new_value: null,
      instruction: null,
      target_field: targetField,
      raw_transcript: transcript
    };
  }

  // 3. Check for Instruction-style modification
  if (containsKeyword(normSearchText, INTENT_KEYWORDS.instruction_triggers)) {
    return {
      intent: "correct_instruction",
      new_value: null,
      instruction: transcript,
      target_field: targetField,
      raw_transcript: transcript
    };
  }

  // 4. Check for Rejection / Correction first
  const hasReject = containsKeyword(normSearchText, INTENT_KEYWORDS.reject);
  if (hasReject) {
    let extractedValue = extractReplacementValue(transcript, targetKind);

    // ZERO TOLERANCE CHECK:
    // If an extracted value was found, it MUST appear verbatim (post-normalization) in the transcript.
    if (extractedValue !== null) {
      const normVal = normalizeForSearch(extractedValue);
      const normTrans = normalizeForSearch(transcript);
      const digitsVal = normalizeDigits(extractedValue);
      const digitsTrans = normalizeDigits(transcript);

      const isVerbatim = (normVal && normTrans.includes(normVal)) ||
                         (digitsVal && digitsTrans.includes(digitsVal));

      if (!isVerbatim) {
        extractedValue = null;
      }
    }

    return {
      intent: "reject",
      new_value: extractedValue,
      instruction: null,
      target_field: targetField,
      raw_transcript: transcript
    };
  }

  // 5. Check for Confirmation
  const hasConfirm = containsKeyword(normSearchText, INTENT_KEYWORDS.confirm);
  if (hasConfirm) {
    return {
      intent: "confirm",
      new_value: null,
      instruction: null,
      target_field: targetField,
      raw_transcript: transcript
    };
  }

  // 6. Direct value statement
  let directValue = extractReplacementValue(transcript, targetKind);
  if (directValue !== null) {
    const digitsVal = normalizeDigits(directValue);
    const digitsTrans = normalizeDigits(transcript);
    if (digitsVal && digitsTrans.includes(digitsVal)) {
      return {
        intent: "reject",
        new_value: directValue,
        instruction: null,
        target_field: targetField,
        raw_transcript: transcript
      };
    }
  }

  // Unclear / noise
  return {
    intent: "unclear",
    new_value: null,
    instruction: null,
    target_field: targetField,
    raw_transcript: transcript
  };
}

/**
 * Extracts candidate replacement value from transcript based on field kind.
 */
function extractReplacementValue(transcript, targetKind) {
  const asciiText = devanagariToAscii(transcript);

  // If contains continuous digits (e.g. "nahi, 962081")
  const digitMatch = asciiText.match(/\b(\d{3,12})\b/);
  if (digitMatch) {
    return digitMatch[1];
  }

  // Pattern: "X nahi Y" e.g. "Sanjay nahi Ajay"
  const contrastAfterMatch = transcript.match(/([A-Za-z\u0900-\u097F]+)\s+(?:nahi|nahin|नहीं)\s+([A-Za-z\u0900-\u097F]+)/i);
  if (contrastAfterMatch) {
    const cand = contrastAfterMatch[2].trim();
    if (!STOP_WORDS.has(cand.toLowerCase())) {
      return cand;
    }
  }

  // Pattern: "nahi, Y hai" or "nahi Y"
  const contrastMatch = transcript.match(/(?:nahi|nahin|नहीं)\s*,?\s+([A-Za-z\u0900-\u097F]+)/i);
  if (contrastMatch) {
    const cand = contrastMatch[1].trim();
    if (!STOP_WORDS.has(cand.toLowerCase())) {
      return cand;
    }
  }

  return null;
}
