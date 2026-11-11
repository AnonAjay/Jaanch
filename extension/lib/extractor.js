/**
 * Jaanch Deterministic Small Field Extractor (extension/lib/extractor.js)
 *
 * 100% local, zero-LLM, deterministic pipeline stage:
 *   VAD -> STT transcript -> Small Field Extractor -> Editable Session DB -> Form Autofill
 *
 * Guarantees:
 * - Zero hallucinations: every extracted value (or normalized email/date/digit view) is grounded
 *   verbatim in the spoken STT transcript.
 * - Supports:
 *   1. Active field verification & correction (single-word and multi-word names, dates, digits,
 *      districts, emails, and free text).
 *   2. Direct voice entry for UNFILLED columns ("", whitespace).
 *   3. Multi-field / label-targeted dictation ("naam Ajay Kumar aur zila Varanasi").
 *   4. Deterministic comparison against form values via compare.js.
 */

import { devanagariToAscii, normalizeDigits, parseDate } from "./normalize.js";
import { compareDates, compareDigits, compareName, compareDistrict, detectScript } from "./compare.js";
import { classifyReply, INTENT_KEYWORDS } from "./intents.js";

const TEXTUAL_MONTH_REGEX_SRC =
  "(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december|janvari|farvari|phurvari|maarch|aprail|maee|joon|julaee|agast|sitambar|aktoobar|navambar|disambar|जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|अक्तूबर|नवंबर|नवम्बर|दिसंबर|दिसम्बर)";

const FILLER_EDGE_WORDS = new Set([
  "haan", "ha", "haa", "han", "ji", "yes", "ok", "okay", "sahi", "theek", "thik", "bilkul",
  "nahi", "nahin", "na", "no", "galat", "wrong", "incorrect", "not",
  "hai", "hain", "tha", "thi", "the", "hoga", "hogi", "kar", "karo", "kijiye", "krdo", "do",
  "likho", "likhiye", "daalo", "dalo", "bharo", "bhariye", "rakho", "is", "it", "this", "that",
  "my", "mera", "meri", "mere", "uska", "uski", "the", "a", "an", "to", "for", "of", "in", "mein", "me", "ko",
  "name", "naam", "district", "zila", "jila", "city", "shehar", "dob", "date", "birth", "pin", "pincode",
  "number", "mobile", "phone", "email", "mail", "address", "pata", "state", "text", "field", "column",
  "please", "pls", "bhai", "sahab", "sir", "madam", "aur", "and",
  "हाँ", "हा", "जी", "सही", "ठीक", "नहीं", "ना", "गलत", "है", "हैं", "था", "थी", "करो", "कीजिए",
  "लिखो", "डालो", "भरो", "मेरा", "मेरी", "नाम", "जिला", "शहर", "तारीख", "नंबर", "पता", "में", "को", "और"
]);

const NON_VALUE_TOKENS = new Set([
  ...INTENT_KEYWORDS.confirm.map((s) => s.toLowerCase()),
  ...INTENT_KEYWORDS.reject.map((s) => s.toLowerCase()),
  ...INTENT_KEYWORDS.repeat.map((s) => s.toLowerCase()),
  ...INTENT_KEYWORDS.hold.map((s) => s.toLowerCase()),
  "hmm", "hm", "uh", "um", "uhh", "erm", "ah", "oh", "shhh", "cough", "noise", "bla", "blah", "hello"
]);

const LABEL_NOISE_WORDS = new Set([
  "enter", "your", "the", "of", "select", "choose", "type", "please", "optional", "required", "field"
]);

const KIND_SHORTHAND_ALIASES = {
  date: ["dob", "date of birth", "birth date", "janam tithi", "janamtithi", "जन्म तिथि", "तारीख", "date"],
  district: ["district", "zila", "jila", "जिला", "city", "shehar", "शहर"],
  email: ["email", "e-mail", "email id", "mail", "ईमेल", "मेल"],
  digits: ["pin", "pincode", "pin code", "mobile", "phone", "aadhaar", "aadhar", "roll number", "application number", "token", "पिन", "पिनकोड", "मोबाइल", "नंबर"],
  name: ["name", "naam", "नाम", "applicant name", "candidate name"],
};

function normalizePhrase(str) {
  return devanagariToAscii(String(str || ""))
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,/\-\\:;!?'"()\[\]{}*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeKeyword(normText, kw) {
  const escaped = escapeRegExp(kw.toLowerCase());
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(normText);
}

/**
 * Strips leading conversational / edit-command prefixes ("change it to", "my name is", "fill")
 * before edge-filler trimming so verbatim values stay clean across languages.
 */
function stripDictationCommandPrefix(text) {
  let prev = "";
  let cur = String(text || "").trim();
  const prefixRe =
    /^(?:(?:please|no|nahi|nahin|galat|wrong)\s*[,:\-]?\s*)*(?:(?:change|update|correct|edit|set|make|replace|fill|put|write|enter|type)(?:\s+(?:it|this|that|in|out|the\s+(?:value|answer|name|text|date|number|district|email|field)|value|answer))?(?:\s+(?:to|with|as|into))?|(?:it\s+)?should\s+be|correct\s+(?:value|answer|name|spelling)\s+is|(?:the\s+)?(?:value|answer|name)\s+is|my\s+(?:name|district|city|email|address)\s+is|actually|instead)\s+/i;
  while (cur && cur !== prev) {
    prev = cur;
    cur = cur.replace(prefixRe, "").trim();
  }
  return cur;
}

/**
 * Strips leading/trailing conversational filler while preserving the inner contiguous phrase.
 */
function trimFillerWords(text) {
  const cleaned = stripDictationCommandPrefix(text)
    .normalize("NFC")
    .replace(/^[\s,.;:!?।\-="']+|[\s,.;:!?।\-="']+$/g, "")
    .trim();
  if (!cleaned) return "";

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && FILLER_EDGE_WORDS.has(tokens[0].replace(/^[,.;:!?।]+|[,.;:!?।]+$/g, "").toLowerCase())) {
    tokens.shift();
  }
  while (tokens.length > 0 && FILLER_EDGE_WORDS.has(tokens[tokens.length - 1].replace(/^[,.;:!?।]+|[,.;:!?।]+$/g, "").toLowerCase())) {
    tokens.pop();
  }
  return tokens.join(" ").trim();
}

/**
 * Verifies verbatim grounding post-normalization to satisfy the zero-hallucination invariant.
 */
export function isVerbatimGrounded(candidate, rawTranscript, kind = "text") {
  if (!candidate || !rawTranscript) return false;
  const candStr = String(candidate).trim();
  if (!candStr) return false;

  if (kind === "digits") {
    const cDigits = normalizeDigits(candStr);
    const tDigits = normalizeDigits(rawTranscript);
    return Boolean(cDigits && tDigits.includes(cDigits));
  }

  if (kind === "date") {
    const parsed = parseDate(candStr);
    if (parsed) {
      const year = String(parsed.year);
      const day = String(parsed.day);
      const asciiTrans = devanagariToAscii(rawTranscript);
      return asciiTrans.includes(year) && (asciiTrans.includes(day) || asciiTrans.includes(String(parsed.day).padStart(2, "0")));
    }
  }

  if (kind === "email") {
    const emailLower = candStr.toLowerCase();
    const normTrans = devanagariToAscii(rawTranscript)
      .toLowerCase()
      .replace(/\s+at\s+the\s+rate\s+/g, "@")
      .replace(/\s+at\s+/g, "@")
      .replace(/\s+dot\s+/g, ".");
    if (normTrans.includes(emailLower)) return true;
  }

  const normCand = normalizePhrase(candStr);
  const normTrans = normalizePhrase(rawTranscript);
  return Boolean(normCand && normTrans.includes(normCand));
}

/**
 * Extracts a typed value from a transcript or labeled clause segment for a given field kind.
 */
export function extractValueForKind(segment, kind = "text", options = {}) {
  const raw = String(segment || "").trim();
  if (!raw) return null;

  const asciiText = devanagariToAscii(raw);
  const normRaw = normalizePhrase(raw);

  // Reject explicit non-understanding / pure noise phrases immediately
  for (const phrase of INTENT_KEYWORDS.unclear_phrases || []) {
    if (normRaw.includes(phrase)) {
      return null;
    }
  }

  // 1. DATE extraction
  if (kind === "date") {
    const numMatch = asciiText.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/);
    if (numMatch) {
      const parsed = parseDate(numMatch[1]);
      if (parsed) return parsed.formatted;
    }

    const dmyRegex = new RegExp(`(?:^|[\\s,.;:!?])(\\d{1,2}\\s+${TEXTUAL_MONTH_REGEX_SRC}\\s+\\d{4})(?=$|[\\s,.;:!?])`, "i");
    const mdyRegex = new RegExp(`(?:^|[\\s,.;:!?])(${TEXTUAL_MONTH_REGEX_SRC}\\s+\\d{1,2},?\\s+\\d{4})(?=$|[\\s,.;:!?])`, "i");
    const m1 = asciiText.match(dmyRegex);
    if (m1) {
      const parsed = parseDate(m1[1]);
      if (parsed) return parsed.formatted;
    }
    const m2 = asciiText.match(mdyRegex);
    if (m2) {
      const parsed = parseDate(m2[1].replace(/,/g, ""));
      if (parsed) return parsed.formatted;
    }
    return null;
  }

  // 2. DIGITS extraction (handles continuous & spaced-out numbers)
  if (kind === "digits") {
    const afterReject = asciiText.match(/(?:nahi|nahin|galat|wrong|no|नहीं)\s*[,:\-]?\s*([\d\s\-]{2,20})/i);
    if (afterReject) {
      const d = normalizeDigits(afterReject[1]);
      if (d.length >= 1) return d;
    }

    const longMatch = asciiText.match(/\b(\d{3,16})\b/);
    if (longMatch) {
      return longMatch[1];
    }

    const spacedGroups = asciiText.match(/(?:^|[\s,])((?:\d[\s\-]*){3,16})(?=$|[\s,.;!?])/);
    if (spacedGroups) {
      const compact = normalizeDigits(spacedGroups[1]);
      if (compact.length >= 3) return compact;
    }

    // For short numeric fields (e.g. unfilled age/house no. "25"), accept if whole cleaned phrase is digits
    const trimmed = trimFillerWords(asciiText);
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  // 3. EMAIL extraction (direct verbatim or unambiguous spoken "at" / "dot")
  if (kind === "email") {
    const directEmail = raw.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
    if (directEmail) {
      return directEmail[1].toLowerCase();
    }
    const spokenNormalized = asciiText
      .toLowerCase()
      .replace(/\s+at\s+the\s+rate\s+/g, "@")
      .replace(/\s+at\s+/g, "@")
      .replace(/\s+dot\s+/g, ".")
      .replace(/\s*@\s*/g, "@")
      .replace(/\s*\.\s*/g, ".");
    const spokenMatch = spokenNormalized.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/);
    if (spokenMatch) {
      return spokenMatch[1];
    }
    return null;
  }

  // 4. NAME / DISTRICT / TEXT extraction
  // First check contrast form "X nahi Y"
  const contrastAfterMatch = raw.match(
    /([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+){0,2})\s+(?:nahi|nahin|no|नहीं)\s+([^,.;!?।]+)/i
  );
  if (contrastAfterMatch) {
    const candidate = trimFillerWords(contrastAfterMatch[2]);
    if (candidate && isPlausibleTextCandidate(candidate, kind)) {
      return candidate;
    }
  }

  // Check rejection prefix form "nahi, Y" / "galat hai Y"
  const rejectPrefixMatch = raw.match(
    /(?:nahi|nahin|galat|wrong|no|नहीं|गलत)(?:\s+hai)?\s*[,:\-]?\s+([^.;!?।]+)/i
  );
  if (rejectPrefixMatch) {
    const candidate = trimFillerWords(rejectPrefixMatch[1]);
    if (candidate && isPlausibleTextCandidate(candidate, kind)) {
      return candidate;
    }
  }

  // Direct dictation (especially important for unfilled columns or direct labeled clauses)
  if (options.allowDirect || options.isUnfilled || options.labeled) {
    // Strip leading "confirm word, " if someone says "haan Ajay Kumar" for an empty field
    const trimmed = trimFillerWords(raw);
    if (trimmed && isPlausibleTextCandidate(trimmed, kind)) {
      return trimmed;
    }
  }

  return null;
}

function isPlausibleTextCandidate(candidate, kind) {
  if (!candidate) return false;
  const clean = candidate.trim();
  if (clean.length < 2 && !/^[A-Za-z0-9\u0900-\u097F]$/.test(clean)) return false;

  const lower = clean.toLowerCase();
  if (NON_VALUE_TOKENS.has(lower)) return false;

  const tokens = lower.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.every((t) => NON_VALUE_TOKENS.has(t) || FILLER_EDGE_WORDS.has(t))) {
    return false;
  }

  if (kind === "name" && tokens.length > 5) return false;
  if (kind === "district" && tokens.length > 4) return false;
  return true;
}

/**
 * Evaluates a candidate extracted value deterministically against a field's form value.
 */
export function evaluateFieldComparison(field, extractedValue) {
  const formValue = (field?.formValue !== undefined ? field.formValue : field?.value) || "";
  const trimmedForm = String(formValue).trim();
  const trimmedExtracted = String(extractedValue || "").trim();

  if (!trimmedExtracted) {
    return { status: field?.status || "not_checked", decision: field?.decision || null, reason: "no_value" };
  }

  // Unfilled column filled by voice
  if (!trimmedForm) {
    return {
      status: "filled",
      decision: null,
      reason: "filled_from_voice",
      displayValue: trimmedExtracted,
    };
  }

  const kind = field?.kind || "text";
  if (kind === "date") {
    const cmp = compareDates(trimmedForm, trimmedExtracted);
    return {
      status: cmp.status,
      decision: cmp.status === "match" ? "match" : null,
      reason: cmp.reason || (cmp.status === "match" ? "exact_date_match" : "date_difference"),
      displayValue: cmp.status === "match" ? trimmedForm : trimmedExtracted,
    };
  }

  if (kind === "digits") {
    const cmp = compareDigits(trimmedForm, trimmedExtracted);
    return {
      status: cmp.status,
      decision: cmp.status === "match" ? "match" : null,
      reason: cmp.reason || (cmp.status === "match" ? "exact_digits_match" : "digits_not_equal"),
      displayValue: cmp.status === "match" ? trimmedForm : trimmedExtracted,
    };
  }

  if (kind === "district") {
    const cmp = compareDistrict(trimmedForm, trimmedExtracted);
    return {
      status: cmp.status,
      decision: cmp.status === "match" ? "match" : null,
      reason: cmp.reason || (cmp.status === "match" ? "district_match" : "district_difference"),
      displayValue: cmp.status === "match" ? trimmedForm : trimmedExtracted,
    };
  }

  if (kind === "name") {
    const cmp = compareName(trimmedForm, trimmedExtracted);
    return {
      status: cmp.status,
      decision: cmp.status === "match" ? "match" : null,
      reason: cmp.reason || (cmp.status === "match" ? "exact_name_match" : "name_spelling_difference"),
      displayValue: cmp.status === "match" ? trimmedForm : trimmedExtracted,
    };
  }

  // Email or generic text exact NFC case-insensitive check
  const scriptA = detectScript(trimmedForm);
  const scriptB = detectScript(trimmedExtracted);
  if (scriptA !== scriptB && (scriptA === "devanagari" || scriptB === "devanagari")) {
    return {
      status: "unsure",
      decision: null,
      reason: "cross_script_comparison",
      displayValue: trimmedExtracted,
    };
  }

  if (trimmedForm.normalize("NFC").toUpperCase() === trimmedExtracted.normalize("NFC").toUpperCase()) {
    return {
      status: "match",
      decision: "match",
      reason: "exact_text_match",
      displayValue: trimmedForm,
    };
  }

  return {
    status: "mismatch",
    decision: null,
    reason: "text_difference",
    displayValue: trimmedExtracted,
  };
}

/**
 * Deterministically resolves unambiguous single-character/token replacement instructions
 * such as "S ki jagah R karo". Returns null when ambiguous (e.g. "ek A lagao").
 */
export function applyInstructionSuggestion(currentValue, instructionText) {
  const val = String(currentValue || "").trim();
  const instr = String(instructionText || "").trim();
  if (!val || !instr) return null;

  // Pattern: "<old> ki jagah <new>"
  const hiMatch = instr.match(/([A-Za-z0-9\u0900-\u097F]+)\s+ki\s+jagah\s+([A-Za-z0-9\u0900-\u097F]+)/i);
  if (hiMatch) {
    return replaceUniqueToken(val, hiMatch[1], hiMatch[2]);
  }

  // Pattern: "replace <old> with <new>"
  const enMatch = instr.match(/replace\s+([A-Za-z0-9\u0900-\u097F]+)\s+with\s+([A-Za-z0-9\u0900-\u097F]+)/i);
  if (enMatch) {
    return replaceUniqueToken(val, enMatch[1], enMatch[2]);
  }

  return null;
}

function replaceUniqueToken(value, target, replacement) {
  const upperVal = value.toUpperCase();
  const upperTarget = target.toUpperCase();
  const firstIdx = upperVal.indexOf(upperTarget);
  if (firstIdx === -1) return null;
  // Reject ambiguous replacements where target occurs multiple times
  if (upperVal.indexOf(upperTarget, firstIdx + 1) !== -1) return null;
  return value.slice(0, firstIdx) + replacement + value.slice(firstIdx + target.length);
}

/**
 * Builds normalized label alias list for multi-field voice extraction.
 */
function buildFieldAliases(fields) {
  const kindCounts = {};
  fields.forEach((f) => {
    const k = f.kind || "text";
    kindCounts[k] = (kindCounts[k] || 0) + 1;
  });

  const entries = [];
  fields.forEach((field) => {
    const aliasSet = new Set();
    const rawLabel = String(field.label || "").trim();
    rawLabel.split("/").forEach((part) => {
      const clean = part.replace(/[:*?()[\]]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      if (clean.length >= 2) aliasSet.add(clean);
      const filteredWords = clean.split(/\s+/).filter((w) => !LABEL_NOISE_WORDS.has(w));
      if (filteredWords.length > 0) {
        const joined = filteredWords.join(" ");
        if (joined.length >= 3) aliasSet.add(joined);
      }
    });

    if (field.id) {
      const idWords = String(field.id)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .replace(/\b(input|field|txt|box)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (idWords.length >= 3) aliasSet.add(idWords);
    }

    const kind = field.kind || "text";
    if (kindCounts[kind] === 1 && KIND_SHORTHAND_ALIASES[kind]) {
      KIND_SHORTHAND_ALIASES[kind].forEach((a) => aliasSet.add(a));
    }

    aliasSet.forEach((alias) => {
      entries.push({ field, alias });
    });
  });

  // Match longest aliases first to avoid partial shadowing (e.g. "father name" before "name")
  entries.sort((a, b) => b.alias.length - a.alias.length);
  return entries;
}

function extractLabeledUpdates(transcript, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return [];
  const aliases = buildFieldAliases(fields);
  if (aliases.length === 0) return [];

  const lowerTrans = transcript.toLowerCase();
  const hits = [];

  for (const entry of aliases) {
    const regex = new RegExp(
      `(?:^|[\\s,;।])${escapeRegExp(entry.alias)}(?:\\s+(?:is|hai|mein|me|ka|ki|ke|ko|as|है|में|को)\\s+|\\s*[:=]\\s*|\\s+)`,
      "gi"
    );
    let match;
    while ((match = regex.exec(lowerTrans)) !== null) {
      const valueStart = match.index + match[0].length;
      const aliasStart = match.index + (match[0].match(/^\s*[,;।]?/)?.[0]?.length || 0);
      const overlaps = hits.some((h) => aliasStart < h.valueStart && valueStart > h.aliasStart);
      if (!overlaps && valueStart < transcript.length) {
        hits.push({
          field: entry.field,
          alias: entry.alias,
          aliasStart,
          valueStart,
        });
      }
    }
  }

  if (hits.length === 0) return [];
  hits.sort((a, b) => a.aliasStart - b.aliasStart);

  // Deduplicate keeping earliest non-overlapping field segments
  const updates = [];
  const seenFieldIds = new Set();

  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    if (seenFieldIds.has(cur.field.id)) continue;
    const nextStart = i + 1 < hits.length ? hits[i + 1].aliasStart : transcript.length;
    const rawSegment = transcript.slice(cur.valueStart, nextStart).replace(/\s+(?:aur|and)\s*$/i, "").trim();
    if (!rawSegment) continue;

    const extractedValue = extractValueForKind(rawSegment, cur.field.kind || "text", {
      allowDirect: true,
      labeled: true,
      isUnfilled: !(cur.field.formValue ?? cur.field.value),
    });

    if (extractedValue && isVerbatimGrounded(extractedValue, transcript, cur.field.kind || "text")) {
      const cmp = evaluateFieldComparison(cur.field, extractedValue);
      seenFieldIds.add(cur.field.id);
      updates.push({
        fieldId: cur.field.id,
        label: cur.field.label,
        kind: cur.field.kind || "text",
        formValue: cur.field.formValue !== undefined ? cur.field.formValue : (cur.field.value || ""),
        extractedValue,
        value: cmp.displayValue || extractedValue,
        status: cmp.status,
        decision: cmp.decision,
        reason: cmp.reason,
        transcript,
        intent: "extract",
        instruction: null,
      });
    }
  }

  return updates;
}

/**
 * Main entrypoint for the Small Field Extractor pipeline stage.
 */
export function extractFieldsFromTranscript(rawTranscript, fields = [], options = {}) {
  const transcript = String(rawTranscript || "").trim();
  if (!transcript) {
    return {
      transcript: "",
      intent: "unclear",
      action: "unclear",
      instruction: null,
      updates: [],
      unmatchedReason: "empty_transcript",
    };
  }

  const fieldList = Array.isArray(fields) ? fields : Object.values(fields || {});
  const activeField =
    (options.activeFieldId && fieldList.find((f) => f.id === options.activeFieldId)) ||
    fieldList[options.currentIndex || 0] ||
    null;

  const baseReply = classifyReply(transcript, {
    targetField: activeField?.id || null,
    targetKind: activeField?.kind || null,
  });

  // 1. Conversational control signals (hold / repeat) never modify fields
  if (baseReply.intent === "hold" || baseReply.intent === "repeat") {
    return {
      transcript,
      intent: baseReply.intent,
      action: baseReply.intent,
      instruction: null,
      updates: [],
      unmatchedReason: null,
    };
  }

  // 2. Instruction-style edit (e.g. "ek A lagao", "S ki jagah R karo")
  if (baseReply.intent === "correct_instruction" && activeField) {
    const currentVal = activeField.value || activeField.formValue || "";
    const suggested = applyInstructionSuggestion(currentVal, transcript);
    return {
      transcript,
      intent: "correct_instruction",
      action: "instruction",
      instruction: transcript,
      updates: [
        {
          fieldId: activeField.id,
          label: activeField.label,
          kind: activeField.kind || "text",
          formValue: activeField.formValue !== undefined ? activeField.formValue : (activeField.value || ""),
          extractedValue: suggested,
          value: currentVal,
          status: "mismatch",
          decision: null,
          reason: suggested ? "instruction_suggestion" : "instruction_needs_edit",
          transcript,
          intent: "correct_instruction",
          instruction: transcript,
        },
      ],
      unmatchedReason: null,
    };
  }

  // 3. Explicit multi-field or label-targeted extraction ("naam Ajay, jila Varanasi")
  const labeledUpdates = extractLabeledUpdates(transcript, fieldList);
  if (labeledUpdates.length > 0) {
    return {
      transcript,
      intent: "extract",
      action: "update",
      instruction: null,
      updates: labeledUpdates,
      unmatchedReason: null,
    };
  }

  if (!activeField) {
    return {
      transcript,
      intent: "unclear",
      action: "unclear",
      instruction: null,
      updates: [],
      unmatchedReason: "no_active_field",
    };
  }

  const formValue = activeField.formValue !== undefined ? activeField.formValue : (activeField.value || "");
  const isUnfilled = !String(formValue).trim();

  // 4. Confirmation against populated field (cannot confirm a blank field as valid without speaking a value)
  if (baseReply.intent === "confirm") {
    if (!isUnfilled) {
      return {
        transcript,
        intent: "confirm",
        action: "confirm",
        instruction: null,
        updates: [
          {
            fieldId: activeField.id,
            label: activeField.label,
            kind: activeField.kind || "text",
            formValue,
            extractedValue: formValue,
            value: activeField.value || formValue,
            status: "match",
            decision: "match",
            reason: "confirmed",
            transcript,
            intent: "confirm",
            instruction: null,
          },
        ],
        unmatchedReason: null,
      };
    }

    // Empty field + "haan, <value>" -> extract dictated value if present after confirm word
    const filledCandidate = extractValueForKind(transcript, activeField.kind || "text", {
      allowDirect: true,
      isUnfilled: true,
    });
    if (filledCandidate && isVerbatimGrounded(filledCandidate, transcript, activeField.kind || "text")) {
      const cmp = evaluateFieldComparison(activeField, filledCandidate);
      return {
        transcript,
        intent: "extract",
        action: "update",
        instruction: null,
        updates: [
          {
            fieldId: activeField.id,
            label: activeField.label,
            kind: activeField.kind || "text",
            formValue,
            extractedValue: filledCandidate,
            value: cmp.displayValue || filledCandidate,
            status: cmp.status,
            decision: cmp.decision,
            reason: cmp.reason,
            transcript,
            intent: "extract",
            instruction: null,
          },
        ],
        unmatchedReason: null,
      };
    }

    return {
      transcript,
      intent: "unclear",
      action: "unclear",
      instruction: null,
      updates: [],
      unmatchedReason: "empty_field_needs_value",
    };
  }

  // 5. Extraction for active field (handles rejection with value OR direct dictation / unfilled column)
  let extractedValue = baseReply.new_value;
  if (!extractedValue) {
    extractedValue = extractValueForKind(transcript, activeField.kind || "text", {
      allowDirect: baseReply.intent === "unclear" || isUnfilled,
      isUnfilled,
    });
  }

  if (extractedValue && isVerbatimGrounded(extractedValue, transcript, activeField.kind || "text")) {
    const cmp = evaluateFieldComparison(activeField, extractedValue);
    return {
      transcript,
      intent: baseReply.intent === "reject" ? "reject" : "extract",
      action: "update",
      instruction: null,
      updates: [
        {
          fieldId: activeField.id,
          label: activeField.label,
          kind: activeField.kind || "text",
          formValue,
          extractedValue,
          value: cmp.displayValue || extractedValue,
          status: cmp.status,
          decision: cmp.decision,
          reason: cmp.reason,
          transcript,
          intent: baseReply.intent === "reject" ? "reject" : "extract",
          instruction: null,
        },
      ],
      unmatchedReason: null,
    };
  }

  // 6. Explicit rejection without a supplied replacement value ("nahi", "galat hai")
  if (baseReply.intent === "reject") {
    return {
      transcript,
      intent: "reject",
      action: "update",
      instruction: null,
      updates: [
        {
          fieldId: activeField.id,
          label: activeField.label,
          kind: activeField.kind || "text",
          formValue,
          extractedValue: null,
          value: activeField.value || formValue,
          status: "mismatch",
          decision: "mismatch",
          reason: "rejected_without_value",
          transcript,
          intent: "reject",
          instruction: null,
        },
      ],
      unmatchedReason: "missing_replacement_value",
    };
  }

  // 7. Unclear / noise fallback
  return {
    transcript,
    intent: "unclear",
    action: "unclear",
    instruction: null,
    updates: [],
    unmatchedReason: "no_value_recognized",
  };
}

const LANGUAGE_LABELS = {
  "en-IN": "English (India - en-IN)",
  "hi-IN": "Hindi (हिंदी - hi-IN)",
  "hi-Latn": "Hinglish (Hindi in Roman Script)",
  "bn-IN": "Bengali (বাংলা - bn-IN)",
  "mr-IN": "Marathi (मराठी - mr-IN)",
  "te-IN": "Telugu (తెలుగు - te-IN)",
  "ta-IN": "Tamil (தமிழ் - ta-IN)",
};

export function getLanguageDisplayLabel(code) {
  return LANGUAGE_LABELS[code] || LANGUAGE_LABELS["en-IN"];
}

function countScripts(text) {
  const counts = { latin: 0, devanagari: 0, bengali: 0, tamil: 0, telugu: 0 };
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) counts.latin++;
    else if (c >= 0x0900 && c <= 0x097f) counts.devanagari++;
    else if (c >= 0x0980 && c <= 0x09ff) counts.bengali++;
    else if (c >= 0x0b80 && c <= 0x0bff) counts.tamil++;
    else if (c >= 0x0c00 && c <= 0x0c7f) counts.telugu++;
  }
  return counts;
}

function dominantIndicFromCounts(counts, normPageLang) {
  const entries = [
    ["hi-IN", counts.devanagari],
    ["bn-IN", counts.bengali],
    ["ta-IN", counts.tamil],
    ["te-IN", counts.telugu],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const [topCode, topCount] = entries[0];
  if (topCount === 0) return null;
  if (topCode === "hi-IN" && normPageLang.startsWith("mr")) return "mr-IN";
  return topCode;
}

/**
 * Deterministically detects the active web form's language for STT and autofill,
 * separate from Hindi TTS verification readback.
 */
export function detectFormLanguage(fields = [], pageLang = "") {
  const list = Array.isArray(fields) ? fields : Object.values(fields || {});
  const normPageLang = String(pageLang || "").trim().toLowerCase();

  const valCounts = { latin: 0, devanagari: 0, bengali: 0, tamil: 0, telugu: 0 };
  const labelCounts = { latin: 0, devanagari: 0, bengali: 0, tamil: 0, telugu: 0 };
  const primaryLabelCounts = { latin: 0, devanagari: 0, bengali: 0, tamil: 0, telugu: 0 };

  for (const f of list) {
    if (!f) continue;
    const rawVal = f.formValue !== undefined ? f.formValue : f.value;
    if (rawVal && f.kind !== "email" && f.kind !== "digits") {
      const vc = countScripts(rawVal);
      for (const k of Object.keys(valCounts)) valCounts[k] += vc[k];
    }

    const rawLabel = String(f.label || "");
    const lc = countScripts(rawLabel);
    for (const k of Object.keys(labelCounts)) labelCounts[k] += lc[k];

    const primaryPart = rawLabel.split("/")[0] || "";
    const pc = countScripts(primaryPart);
    for (const k of Object.keys(primaryLabelCounts)) primaryLabelCounts[k] += pc[k];
  }

  const labelIndic = labelCounts.devanagari + labelCounts.bengali + labelCounts.tamil + labelCounts.telugu;
  // Unambiguous single-script form labels always define the form language regardless of leftover input text
  if (labelIndic === 0 && labelCounts.latin > 0) return "en-IN";
  if (labelCounts.latin === 0 && labelIndic > 0) return dominantIndicFromCounts(labelCounts, normPageLang) || "hi-IN";

  // For bilingual / mixed labels, filled non-ID form values reveal the active portal entry script
  const valIndic = valCounts.devanagari + valCounts.bengali + valCounts.tamil + valCounts.telugu;
  if (valIndic > 0 || valCounts.latin > 0) {
    if (valIndic === 0 && valCounts.latin > 0) return "en-IN";
    if (valCounts.latin === 0 && valIndic > 0) return dominantIndicFromCounts(valCounts, normPageLang) || "hi-IN";
    return valIndic > valCounts.latin
      ? dominantIndicFromCounts(valCounts, normPageLang) || "hi-IN"
      : "en-IN";
  }

  if (labelIndic > 0 && labelCounts.latin > 0) {
    const isExplicitEn = /^en(?:-|$)/.test(normPageLang);
    const isExplicitIndic = /^(hi|mr|bn|ta|te)(?:-in)?$/.test(normPageLang);
    if (isExplicitEn && labelCounts.latin >= labelIndic * 0.5) return "en-IN";
    if (isExplicitIndic) return dominantIndicFromCounts(labelCounts, normPageLang) || `${normPageLang.slice(0, 2)}-IN`;

    const primaryIndic =
      primaryLabelCounts.devanagari +
      primaryLabelCounts.bengali +
      primaryLabelCounts.tamil +
      primaryLabelCounts.telugu;
    if (primaryIndic !== primaryLabelCounts.latin) {
      return primaryIndic > primaryLabelCounts.latin
        ? dominantIndicFromCounts(primaryLabelCounts, normPageLang) || "hi-IN"
        : "en-IN";
    }
    return labelIndic > labelCounts.latin
      ? dominantIndicFromCounts(labelCounts, normPageLang) || "hi-IN"
      : "en-IN";
  }

  if (normPageLang.startsWith("en")) return "en-IN";
  if (normPageLang.startsWith("bn")) return "bn-IN";
  if (normPageLang.startsWith("ta")) return "ta-IN";
  if (normPageLang.startsWith("te")) return "te-IN";
  if (normPageLang.startsWith("mr")) return "mr-IN";
  if (normPageLang.startsWith("hi")) return "hi-IN";
  return "en-IN";
}
