/**
 * Jaanch Normalization Library (extension/lib/normalize.js)
 * Pure deterministic ES module for digit and date normalization.
 * Zero external dependencies.
 */

const DEVANAGARI_DIGITS = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"
};

const HINDI_MONTH_MAP = {
  // English standard & abbreviations
  "jan": 1, "january": 1,
  "feb": 2, "february": 2,
  "mar": 3, "march": 3,
  "apr": 4, "april": 4,
  "may": 5,
  "jun": 6, "june": 6,
  "jul": 7, "july": 7,
  "aug": 8, "august": 8,
  "sep": 9, "sept": 9, "september": 9,
  "oct": 10, "october": 10,
  "nov": 11, "november": 11,
  "dec": 12, "december": 12,

  // Hindi Devanagari
  "जनवरी": 1,
  "फ़रवरी": 2, "फरवरी": 2,
  "मार्च": 3,
  "अप्रैल": 4,
  "मई": 5,
  "जून": 6,
  "जुलाई": 7,
  "अगस्त": 8,
  "सितंबर": 9, "सितम्बर": 9,
  "अक्टूबर": 10, "अक्तूबर": 10,
  "नवंबर": 11, "नवम्बर": 11,
  "दिसंबर": 12, "दिसम्बर": 12,

  // Romanized Hindi
  "janvari": 1, "farvari": 2, "phurvari": 2, "maarch": 3, "aprail": 4,
  "maee": 5, "joon": 6, "julaee": 7, "agast": 8, "sitambar": 9,
  "aktoobar": 10, "navambar": 11, "disambar": 12
};

/**
 * Converts any Devanagari digits in a string to standard ASCII digits (0-9).
 * Preserves other text and separators.
 */
export function devanagariToAscii(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[०-९]/g, (ch) => DEVANAGARI_DIGITS[ch] || ch);
}

/**
 * Normalizes a digit string: maps Devanagari to ASCII and strips spaces/punctuation.
 * Returns only the sequence of digits [0-9].
 */
export function normalizeDigits(str) {
  if (typeof str !== "string") return "";
  const converted = devanagariToAscii(str);
  return converted.replace(/[^0-9]/g, "");
}

/**
 * Parses a date string into an object: { day, month, year, iso }
 * Accepts:
 *   - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *   - D Mon YYYY, DD Month YYYY (English or Hindi)
 *   - Devanagari numerals
 * 
 * STRICT INVARIANT: Two-digit years (e.g. 78 or 98) are never guessed; returns null.
 */
export function parseDate(str) {
  if (!str || typeof str !== "string") return null;

  // Convert Devanagari numerals to ASCII first
  let s = devanagariToAscii(str).trim();

  // 1. Check numeric formats with separators: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const numericMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (numericMatch) {
    const rawDay = parseInt(numericMatch[1], 10);
    const rawMonth = parseInt(numericMatch[2], 10);
    const rawYear = numericMatch[3];

    // Invariant: Two-digit years are strictly rejected
    if (rawYear.length !== 4) {
      return null;
    }

    const year = parseInt(rawYear, 10);
    if (!isValidDate(rawDay, rawMonth, year)) {
      return null;
    }

    return formatParsedDate(rawDay, rawMonth, year);
  }

  // 2. Check textual month formats: e.g. "12 Mar 1978", "12 March 1978", "12 मार्च 1978"
  // Normalize whitespace and split
  const tokens = s.split(/[\s,\-\/\.]+/).filter(Boolean);
  if (tokens.length === 3) {
    // Potential patterns: [Day, Month, Year] or [Month, Day, Year]
    let day = null;
    let month = null;
    let year = null;

    // Check if middle token is month name
    const midMonthKey = tokens[1].toLowerCase();
    if (HINDI_MONTH_MAP[midMonthKey]) {
      day = parseInt(tokens[0], 10);
      month = HINDI_MONTH_MAP[midMonthKey];
      const yearStr = tokens[2];
      if (yearStr.length !== 4) return null; // strictly reject 2-digit years
      year = parseInt(yearStr, 10);
    } else {
      // Check if first token is month name: "March 12 1978"
      const firstMonthKey = tokens[0].toLowerCase();
      if (HINDI_MONTH_MAP[firstMonthKey]) {
        month = HINDI_MONTH_MAP[firstMonthKey];
        day = parseInt(tokens[1], 10);
        const yearStr = tokens[2];
        if (yearStr.length !== 4) return null;
        year = parseInt(yearStr, 10);
      }
    }

    if (day && month && year && isValidDate(day, month, year)) {
      return formatParsedDate(day, month, year);
    }
  }

  return null;
}

function isValidDate(day, month, year) {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Month days check including leap years
  const daysInMonths = [31, (isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonths[month - 1];
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function formatParsedDate(day, month, year) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    day,
    month,
    year,
    iso: `${year}-${pad(month)}-${pad(day)}`,
    formatted: `${pad(day)}/${pad(month)}/${year}`
  };
}
