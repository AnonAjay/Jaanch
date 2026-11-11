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
  ],
  unclear_phrases: [
    "samajh nahi", "samajh mein nahi", "sunai nahi", "sunaai nahi", "saaf nahi",
    "clear nahi", "awaaz nahi", "avaz nahi", "pata nahi", "maloom nahi",
    "did not understand", "didn't understand", "not clear", "can't hear", "cant hear",
    "समझ नहीं", "समझ में नहीं", "सुनाई नहीं", "साफ नहीं", "आवाज नहीं", "पता नहीं", "मालूम नहीं"
  ]
};

const STOP_WORDS = new Set([
  "hai", "hain", "tha", "thi", "the", "bhai", "ji", "sahab", "ye", "wo", "karo", "kijiye",
  "kar", "do", "likho", "likhiye", "naam", "district", "number", "dob", "sir", "madam", "it", "is",
  "galat", "sahi", "nahi", "nahin", "wrong", "right", "incorrect", "correct", "please", "aur",
  "है", "हैं", "था", "थी", "थे", "जी", "भाई", "साहब", "ये", "वो", "करो", "कीजिए", "कर", "दो", "लिखो", "नाम", "गलत", "सही", "नहीं"
]);

const TEXTUAL_MONTH_PATTERN = "(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december|janvari|farvari|phurvari|maarch|aprail|maee|joon|julaee|agast|sitambar|aktoobar|navambar|disambar|जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|अक्तूबर|नवंबर|नवम्बर|दिसंबर|दिसम्बर)";

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

  // 2.5 Check for explicit non-understanding / unclear phrases before reject ("samajh nahi")
  if (containsKeyword(normSearchText, INTENT_KEYWORDS.unclear_phrases)) {
    return {
      intent: "unclear",
      new_value: null,
      instruction: null,
      target_field: targetField,
      raw_transcript: transcript
    };
  }

  // 2.6 Direct full-value replacement commands ("replace with <val>", "change it to <val>", "correct it to <val>")
  const directEditCmd = transcript.match(
    /^\s*(?:please\s+)?(?:replace\s+(?:(?:it|this|that)\s+)?with|(?:change|update|correct|edit|set)\s+(?:(?:it|this|that|the\s+(?:value|answer|name|text|date|number|district|email))\s+)?(?:to|as|into)|(?:make\s+(?:it|this|that|the\s+value))|(?:it\s+)?should\s+be|answer\s+is|value\s+is)\s+(.+)$/i
  );
  if (directEditCmd) {
    const tail = directEditCmd[1].trim();
    const candidate = extractReplacementValue(`no, ${tail}`, targetKind) || trimTrailingStopWords(tail);
    const verified = verifyVerbatimCandidate(candidate, transcript);
    if (verified) {
      return {
        intent: "reject",
        new_value: verified,
        instruction: null,
        target_field: targetField,
        raw_transcript: transcript
      };
    }
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
      extractedValue = verifyVerbatimCandidate(extractedValue, transcript);
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

  // 6. Direct value statement (digits, explicit date, or email)
  let directValue = extractReplacementValue(transcript, targetKind);
  if (directValue !== null) {
    directValue = verifyVerbatimCandidate(directValue, transcript);
    const digitsVal = normalizeDigits(directValue || "");
    const digitsTrans = normalizeDigits(transcript);
    const hasEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(directValue || "");
    if (directValue && ((digitsVal && digitsTrans.includes(digitsVal)) || hasEmail)) {
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

function verifyVerbatimCandidate(candidate, transcript) {
  if (!candidate) return null;
  const normVal = normalizeForSearch(candidate);
  const normTrans = normalizeForSearch(transcript);
  const digitsVal = normalizeDigits(candidate);
  const digitsTrans = normalizeDigits(transcript);

  const isVerbatim = (normVal && normTrans.includes(normVal)) ||
                     (digitsVal && digitsTrans.includes(digitsVal));
  return isVerbatim ? candidate : null;
}

function trimTrailingStopWords(phrase) {
  if (!phrase) return "";
  const tokens = phrase
    .replace(/[.,;!?।]+$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 0 && STOP_WORDS.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  while (tokens.length > 0 && STOP_WORDS.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }
  return tokens.join(" ").trim();
}

/**
 * Extracts candidate replacement value from transcript based on field kind.
 */
function extractReplacementValue(transcript, targetKind) {
  const asciiText = devanagariToAscii(transcript);

  // 1. Check date patterns FIRST (before \d{3,12} steals just the year!)
  const numericDateMatch = asciiText.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/);
  if (numericDateMatch) {
    return numericDateMatch[1];
  }

  const textMonthDayFirst = new RegExp(`(?:^|[\\s,.;:!?])(\\d{1,2}\\s+${TEXTUAL_MONTH_PATTERN}\\s+\\d{4})(?=$|[\\s,.;:!?])`, "i");
  const textMonthFirst = new RegExp(`(?:^|[\\s,.;:!?])(${TEXTUAL_MONTH_PATTERN}\\s+\\d{1,2},?\\s+\\d{4})(?=$|[\\s,.;:!?])`, "i");
  const m1 = asciiText.match(textMonthDayFirst);
  if (m1) return m1[1];
  const m2 = asciiText.match(textMonthFirst);
  if (m2) return m2[1].replace(/,/g, "");

  // 2. Email pattern
  const emailMatch = transcript.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
  if (emailMatch) {
    return emailMatch[1];
  }

  // 3. Continuous digits (e.g. "nahi, 962081")
  const digitMatch = asciiText.match(/\b(\d{3,15})\b/);
  if (digitMatch) {
    return digitMatch[1];
  }

  // 4. Spaced digit dictation (e.g. "9 6 2 0 8 1") when targeting digits
  if (targetKind === "digits" || targetKind === "phone" || targetKind === "number") {
    const spacedMatch = asciiText.match(/(?:^|[\s,])((?:\d[\s\-]*){3,15})(?=$|[\s,.;!?])/);
    if (spacedMatch) {
      const compact = normalizeDigits(spacedMatch[1]);
      if (compact.length >= 3) {
        return compact;
      }
    }
  }

  // 5. Contrast pattern: "X nahi Y" e.g. "Sanjay nahi Ajay" or "Sanjay nahi Ajay Kumar hai"
  const contrastAfterMatch = transcript.match(
    /([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)\s+(?:nahi|nahin|no|नहीं)\s+([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+){0,3})/i
  );
  if (contrastAfterMatch) {
    const cand = trimTrailingStopWords(contrastAfterMatch[2]);
    if (cand && !STOP_WORDS.has(cand.toLowerCase())) {
      return cand;
    }
  }

  // 6. Rejection prefix pattern: "nahi, Y hai" / "galat hai, Y" / "no, Y"
  const contrastMatch = transcript.match(
    /(?:nahi|nahin|galat|wrong|no|नहीं|गलत)(?:\s+hai)?\s*[,:\-]?\s+([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+){0,4})/i
  );
  if (contrastMatch) {
    const cand = trimTrailingStopWords(contrastMatch[1]);
    if (cand && !STOP_WORDS.has(cand.toLowerCase())) {
      return cand;
    }
  }

  return null;
}
