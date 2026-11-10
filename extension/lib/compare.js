/**
 * Jaanch Comparison Library (extension/lib/compare.js)
 * Deterministic comparison logic for dates, digits, names, and districts.
 * Zero external dependencies.
 */

import { normalizeDigits, parseDate } from "./normalize.js";

/**
 * Compares two date representations.
 * Handles strings or pre-parsed date objects.
 * 
 * Rules:
 *  - Matches ONLY if day, month, and year match exactly.
 *  - Day and month swapped is an explicit MISMATCH (e.g. 03/12/1978 vs 12/03/1978).
 *  - If either date is unparseable (e.g. 2-digit year), returns "unsure".
 */
export function compareDates(dateStrA, dateStrB) {
  const parsedA = typeof dateStrA === "object" && dateStrA?.iso ? dateStrA : parseDate(dateStrA);
  const parsedB = typeof dateStrB === "object" && dateStrB?.iso ? dateStrB : parseDate(dateStrB);

  if (!parsedA || !parsedB) {
    return {
      status: "unsure",
      reason: "unparseable_date",
      parsedA,
      parsedB
    };
  }

  // Exact match
  if (parsedA.day === parsedB.day && parsedA.month === parsedB.month && parsedA.year === parsedB.year) {
    return {
      status: "match",
      parsedA,
      parsedB
    };
  }

  // Check for day and month swap error (critical cyber-cafe error pattern)
  if (
    parsedA.year === parsedB.year &&
    parsedA.day === parsedB.month &&
    parsedA.month === parsedB.day &&
    parsedA.day !== parsedA.month
  ) {
    return {
      status: "mismatch",
      reason: "day_month_swapped",
      parsedA,
      parsedB
    };
  }

  return {
    status: "mismatch",
    reason: "date_difference",
    parsedA,
    parsedB
  };
}

/**
 * Compares two digit strings (application numbers, tokens, PINs).
 * Normalizes Devanagari numerals to ASCII and strips spaces/hyphens.
 * Must be EXACT full equality (500 must NOT match inside 1500).
 */
export function compareDigits(digitsA, digitsB) {
  const normA = normalizeDigits(digitsA);
  const normB = normalizeDigits(digitsB);

  if (!normA && !normB) {
    return { status: "unsure", reason: "empty_digits", normA, normB };
  }

  if (normA === normB) {
    return { status: "match", normA, normB };
  }

  return {
    status: "mismatch",
    reason: "digits_not_equal",
    normA,
    normB
  };
}

/**
 * Script detection helper:
 * Detects whether string contains Devanagari Unicode characters (\u0900-\u097F)
 * or Latin alphabet (\u0041-\u005A, \u0061-\u007A).
 */
export function detectScript(str) {
  if (!str) return "empty";
  const hasDevanagari = /[\u0900-\u097F]/.test(str);
  const hasLatin = /[a-zA-Z]/.test(str);

  if (hasDevanagari && !hasLatin) return "devanagari";
  if (hasLatin && !hasDevanagari) return "latin";
  if (hasDevanagari && hasLatin) return "mixed";
  return "other";
}

/**
 * Compares two names.
 * Invariant: Exact after trim, Unicode NFC normalization, and case insensitivity.
 * Different scripts (e.g. "Sanjay" vs "संजय") returns "unsure" in v1 (no fuzzy guessing).
 */
export function compareName(nameA, nameB) {
  if (!nameA || !nameB) {
    return { status: "unsure", reason: "missing_name" };
  }

  const cleanA = String(nameA).normalize("NFC").trim();
  const cleanB = String(nameB).normalize("NFC").trim();

  const scriptA = detectScript(cleanA);
  const scriptB = detectScript(cleanB);

  // Cross-script comparison cannot be strictly compared deterministically without OCR/transliteration models
  if (scriptA !== scriptB && (scriptA === "devanagari" || scriptB === "devanagari")) {
    return {
      status: "unsure",
      reason: "cross_script_comparison",
      cleanA,
      cleanB
    };
  }

  // Exact comparison
  if (cleanA.toUpperCase() === cleanB.toUpperCase()) {
    return { status: "match", cleanA, cleanB };
  }

  return {
    status: "mismatch",
    reason: "name_spelling_difference",
    cleanA,
    cleanB
  };
}

/**
 * Compares two district names with basic alias support for known Indian cities/districts.
 */
const DISTRICT_ALIASES = [
  new Set(["VARANASI", "BANARAS", "KASHI", "वाराणसी", "बनारस", "काशी"]),
  new Set(["PRAYAGRAJ", "ALLAHABAD", "प्रयागराज", "इलाहाबाद"]),
  new Set(["AYODHYA", "FAIZABAD", "अयोध्या", "फैजाबाद"]),
  new Set(["KANPUR", "कानपुर"]),
  new Set(["LUCKNOW", "लखनऊ"])
];

export function compareDistrict(distA, distB) {
  if (!distA || !distB) {
    return { status: "unsure", reason: "missing_district" };
  }

  const cleanA = String(distA).normalize("NFC").trim().toUpperCase();
  const cleanB = String(distB).normalize("NFC").trim().toUpperCase();

  if (cleanA === cleanB) {
    return { status: "match", cleanA, cleanB };
  }

  // Check alias sets
  for (const aliasSet of DISTRICT_ALIASES) {
    if (aliasSet.has(cleanA) && aliasSet.has(cleanB)) {
      return { status: "match", reason: "district_alias_match", cleanA, cleanB };
    }
  }

  const scriptA = detectScript(cleanA);
  const scriptB = detectScript(cleanB);
  if (scriptA !== scriptB && (scriptA === "devanagari" || scriptB === "devanagari")) {
    return { status: "unsure", reason: "cross_script_comparison", cleanA, cleanB };
  }

  return {
    status: "mismatch",
    reason: "district_difference",
    cleanA,
    cleanB
  };
}
