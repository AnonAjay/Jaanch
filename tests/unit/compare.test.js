/**
 * Unit Tests for Comparison Logic (tests/unit/compare.test.js)
 * Runnable with: node --test tests/unit/compare.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { compareDates, compareDigits, compareName, compareDistrict } from "../../extension/lib/compare.js";

test("compareDates: matching dates across representations", () => {
  const res1 = compareDates("12/03/1978", "12-03-1978");
  assert.equal(res1.status, "match");

  const res2 = compareDates("12/03/1978", "12 Mar 1978");
  assert.equal(res2.status, "match");

  const res3 = compareDates("१२-०३-१९७८", "12/03/1978");
  assert.equal(res3.status, "match");
});

test("compareDates: Day and month swapped MUST flag as MISMATCH", () => {
  // Classic cyber cafe error: 03/12/1978 vs 12/03/1978
  const res = compareDates("03/12/1978", "12/03/1978");
  assert.equal(res.status, "mismatch");
  assert.equal(res.reason, "day_month_swapped");
});

test("compareDates: Two-digit year results in 'unsure'", () => {
  const res = compareDates("12/03/78", "12/03/1978");
  assert.equal(res.status, "unsure");
  assert.equal(res.reason, "unparseable_date");
});

test("compareDigits: Exact equality required (500 must not match 1500)", () => {
  const exact = compareDigits("962081", "962 081");
  assert.equal(exact.status, "match");

  const devanagari = compareDigits("९६२०८१", "962081");
  assert.equal(devanagari.status, "match");

  const substringCheck = compareDigits("500", "1500");
  assert.equal(substringCheck.status, "mismatch");
  assert.equal(substringCheck.reason, "digits_not_equal");

  const prefixCheck = compareDigits("962081", "96208");
  assert.equal(prefixCheck.status, "mismatch");
});

test("compareName: Exact spelling, NFC normalized, and case insensitivity", () => {
  const match = compareName("SANJAY KUMAR", "sanjay kumar");
  assert.equal(match.status, "match");

  // Misspelling
  const typo = compareName("Sanjay", "Sajay");
  assert.equal(typo.status, "mismatch");
  assert.equal(typo.reason, "name_spelling_difference");
});

test("compareName: Cross-script comparison (Latin vs Devanagari) returns 'unsure'", () => {
  const crossScript = compareName("Sanjay", "संजय");
  assert.equal(crossScript.status, "unsure");
  assert.equal(crossScript.reason, "cross_script_comparison");
});

test("compareDistrict: Exact match and known aliases", () => {
  const exact = compareDistrict("Varanasi", "VARANASI");
  assert.equal(exact.status, "match");

  const alias = compareDistrict("Banaras", "Varanasi");
  assert.equal(alias.status, "match");

  const mismatch = compareDistrict("Varanasi", "Lucknow");
  assert.equal(mismatch.status, "mismatch");
});
