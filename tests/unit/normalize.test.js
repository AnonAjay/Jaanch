/**
 * Unit Tests for Normalization (tests/unit/normalize.test.js)
 * Runnable with: node --test tests/unit/normalize.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { devanagariToAscii, normalizeDigits, parseDate } from "../../extension/lib/normalize.js";

test("devanagariToAscii converts Hindi numerals to standard ASCII", () => {
  assert.equal(devanagariToAscii("१२-०३-१९७८"), "12-03-1978");
  assert.equal(devanagariToAscii("९६२०८१"), "962081");
  assert.equal(devanagariToAscii("Hello ०१२३४५६७८९"), "Hello 0123456789");
});

test("normalizeDigits strips spaces, hyphens, and formats digits", () => {
  assert.equal(normalizeDigits("962 081"), "962081");
  assert.equal(normalizeDigits("९६२-०८१"), "962081");
  assert.equal(normalizeDigits("Ref: #123-456"), "123456");
  assert.equal(normalizeDigits(""), "");
  assert.equal(normalizeDigits(null), "");
});

test("parseDate parses numeric dates with various delimiters", () => {
  const d1 = parseDate("18/03/1998");
  assert.deepEqual(d1, { day: 18, month: 3, year: 1998, iso: "1998-03-18", formatted: "18/03/1998" });

  const d2 = parseDate("12-03-1978");
  assert.deepEqual(d2, { day: 12, month: 3, year: 1978, iso: "1978-03-12", formatted: "12/03/1978" });

  const d3 = parseDate("05.11.2001");
  assert.deepEqual(d3, { day: 5, month: 11, year: 2001, iso: "2001-11-05", formatted: "05/11/2001" });
});

test("parseDate handles Devanagari numerals in dates", () => {
  const parsed = parseDate("१२-०३-१९७८");
  assert.deepEqual(parsed, { day: 12, month: 3, year: 1978, iso: "1978-03-12", formatted: "12/03/1978" });
});

test("parseDate parses Hindi and English month names", () => {
  const p1 = parseDate("12 Mar 1978");
  assert.deepEqual(p1, { day: 12, month: 3, year: 1978, iso: "1978-03-12", formatted: "12/03/1978" });

  const p2 = parseDate("12 मार्च 1978");
  assert.deepEqual(p2, { day: 12, month: 3, year: 1978, iso: "1978-03-12", formatted: "12/03/1978" });

  const p3 = parseDate("15 August 1947");
  assert.deepEqual(p3, { day: 15, month: 8, year: 1947, iso: "1947-08-15", formatted: "15/08/1947" });
});

test("parseDate STRICT INVARIANT: Two-digit years return null (never guess)", () => {
  assert.equal(parseDate("12/03/78"), null);
  assert.equal(parseDate("18-03-98"), null);
  assert.equal(parseDate("12 Mar 78"), null);
});

test("parseDate rejects invalid dates", () => {
  assert.equal(parseDate("31/02/2020"), null); // Feb never has 31 days
  assert.equal(parseDate("29/02/2021"), null); // 2021 is not a leap year
  assert.equal(parseDate("12/13/1990"), null); // Invalid month 13
  assert.equal(parseDate("not a date"), null);
});
