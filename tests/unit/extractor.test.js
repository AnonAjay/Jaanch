/**
 * Unit Tests for Local Deterministic Small Field Extractor (extension/lib/extractor.js)
 * Runnable with: node --test tests/unit/extractor.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFieldsFromTranscript,
  extractValueForKind,
  evaluateFieldComparison,
  applyInstructionSuggestion,
  isVerbatimGrounded,
  detectFormLanguage,
} from "../../extension/lib/extractor.js";

const SAMPLE_FIELDS = [
  { id: "candidate-name", label: "Candidate Name / आवेदक का नाम", kind: "name", formValue: "SANJAY", value: "SANJAY", status: "not_checked" },
  { id: "dob", label: "Date of Birth / जन्म तिथि", kind: "date", formValue: "1978-03-12", value: "1978-03-12", status: "not_checked" },
  { id: "district", label: "District / जिला", kind: "district", formValue: "", value: "", status: "not_checked" },
  { id: "pin-code", label: "PIN Code / पिन कोड", kind: "digits", formValue: "221001", value: "221001", status: "not_checked" },
  { id: "email", label: "Email ID", kind: "email", formValue: "", value: "", status: "not_checked" },
];

test("extractFieldsFromTranscript: confirmation on populated field vs blank field", () => {
  const resMatch = extractFieldsFromTranscript("हाँ सही है", SAMPLE_FIELDS, { activeFieldId: "candidate-name" });
  assert.equal(resMatch.action, "confirm");
  assert.equal(resMatch.updates.length, 1);
  assert.equal(resMatch.updates[0].status, "match");

  const resBlank = extractFieldsFromTranscript("हाँ सही है", SAMPLE_FIELDS, { activeFieldId: "district" });
  assert.equal(resBlank.action, "unclear");
  assert.equal(resBlank.updates.length, 0);
  assert.equal(resBlank.unmatchedReason, "empty_field_needs_value");
});

test("extractFieldsFromTranscript: contrast rejection extracts multi-word name and flags mismatch", () => {
  const res = extractFieldsFromTranscript("Sanjay nahi Ajay Kumar hai", SAMPLE_FIELDS, { activeFieldId: "candidate-name" });
  assert.equal(res.action, "update");
  assert.equal(res.updates.length, 1);
  assert.equal(res.updates[0].fieldId, "candidate-name");
  assert.equal(res.updates[0].extractedValue, "Ajay Kumar");
  assert.equal(res.updates[0].status, "mismatch");
});

test("extractFieldsFromTranscript: compares ISO HTML5 date cleanly against spoken Hindi/DMY date", () => {
  const res = extractFieldsFromTranscript("12 मार्च 1978", SAMPLE_FIELDS, { activeFieldId: "dob" });
  assert.equal(res.action, "update");
  assert.equal(res.updates[0].status, "match");

  const mismatch = extractFieldsFromTranscript("nahi 18/03/1978 hai", SAMPLE_FIELDS, { activeFieldId: "dob" });
  assert.equal(mismatch.updates[0].status, "mismatch");
  assert.equal(mismatch.updates[0].extractedValue, "18/03/1978");
});

test("extractFieldsFromTranscript: fills unfilled columns directly via audio input", () => {
  const distRes = extractFieldsFromTranscript("Varanasi", SAMPLE_FIELDS, { activeFieldId: "district" });
  assert.equal(distRes.action, "update");
  assert.equal(distRes.updates[0].fieldId, "district");
  assert.equal(distRes.updates[0].status, "filled");
  assert.equal(distRes.updates[0].value, "Varanasi");

  const emailRes = extractFieldsFromTranscript("ajay.kumar at gmail dot com", SAMPLE_FIELDS, { activeFieldId: "email" });
  assert.equal(emailRes.action, "update");
  assert.equal(emailRes.updates[0].status, "filled");
  assert.equal(emailRes.updates[0].value, "ajay.kumar@gmail.com");
});

test("extractFieldsFromTranscript: handles spaced digits and rejects unclear comprehension phrases", () => {
  const digitRes = extractFieldsFromTranscript("2 2 1 0 0 1", SAMPLE_FIELDS, { activeFieldId: "pin-code" });
  assert.equal(digitRes.action, "update");
  assert.equal(digitRes.updates[0].status, "match");

  const unclearRes = extractFieldsFromTranscript("kuch samajh nahi aaya", SAMPLE_FIELDS, { activeFieldId: "candidate-name" });
  assert.equal(unclearRes.intent, "unclear");
  assert.equal(unclearRes.updates.length, 0);
});

test("extractFieldsFromTranscript: multi-field labeled extraction fills/updates multiple columns deterministically", () => {
  const res = extractFieldsFromTranscript(
    "Candidate Name Ajay Kumar, District Varanasi aur PIN Code 221005",
    SAMPLE_FIELDS,
    { activeFieldId: "candidate-name" }
  );
  assert.equal(res.action, "update");
  assert.equal(res.intent, "extract");
  const byId = Object.fromEntries(res.updates.map((u) => [u.fieldId, u]));
  assert.equal(byId["candidate-name"]?.extractedValue, "Ajay Kumar");
  assert.equal(byId["candidate-name"]?.status, "mismatch");
  assert.equal(byId["district"]?.extractedValue, "Varanasi");
  assert.equal(byId["district"]?.status, "filled");
  assert.equal(byId["pin-code"]?.extractedValue, "221005");
  assert.equal(byId["pin-code"]?.status, "mismatch");
});

test("applyInstructionSuggestion & isVerbatimGrounded obey zero-hallucination invariant", () => {
  assert.equal(applyInstructionSuggestion("SANJAY", "ek A lagao"), null);
  assert.equal(applyInstructionSuggestion("SANJAY", "S ki jagah R karo"), "RANJAY");
  assert.equal(isVerbatimGrounded("Ajay Kumar", "mera naam Ajay Kumar hai", "name"), true);
  assert.equal(isVerbatimGrounded("Ramesh", "mera naam Ajay Kumar hai", "name"), false);
  assert.equal(extractValueForKind("noise bla bla", "name", { allowDirect: true }), null);
  assert.equal(evaluateFieldComparison({ formValue: "", kind: "text" }, "OBC").status, "filled");
});

test("extractFieldsFromTranscript handles English edit phrasing on English forms", () => {
  const englishFields = [
    { id: "full-name", label: "Full Name", kind: "name", formValue: "Sanjay", value: "Sanjay" },
    { id: "city", label: "District", kind: "district", formValue: "", value: "" },
  ];

  const changeRes = extractFieldsFromTranscript("change it to Ajay Kumar", englishFields, { activeFieldId: "full-name" });
  assert.equal(changeRes.updates[0]?.extractedValue, "Ajay Kumar");
  assert.equal(changeRes.updates[0]?.status, "mismatch");

  const correctRes = extractFieldsFromTranscript("correct it to Rahul Verma", englishFields, { activeFieldId: "full-name" });
  assert.equal(correctRes.updates[0]?.extractedValue, "Rahul Verma");

  const replaceRes = extractFieldsFromTranscript("replace with Priya Singh", englishFields, { activeFieldId: "full-name" });
  assert.equal(replaceRes.updates[0]?.extractedValue, "Priya Singh");

  const fillRes = extractFieldsFromTranscript("fill Lucknow", englishFields, { activeFieldId: "city" });
  assert.equal(fillRes.updates[0]?.value, "Lucknow");
  assert.equal(fillRes.updates[0]?.status, "filled");
});

test("detectFormLanguage separates form/STT language cleanly for English, Hindi, and bilingual forms", () => {
  assert.equal(
    detectFormLanguage([
      { label: "Full Name", kind: "name", formValue: "संजय" },
      { label: "Date of Birth", kind: "date", formValue: "" },
    ], "hi"),
    "en-IN"
  );
  assert.equal(
    detectFormLanguage([
      { label: "अभ्यर्थी का नाम", kind: "name", formValue: "" },
      { label: "पंजीकरण संख्या", kind: "digits", formValue: "UP2026001" },
    ], "en"),
    "hi-IN"
  );
  assert.equal(
    detectFormLanguage([
      { label: "Candidate Full Name / अभ्यर्थी का नाम", kind: "name", formValue: "" },
      { label: "District / जिला", kind: "district", formValue: "" },
    ], "en"),
    "en-IN"
  );
  assert.equal(
    detectFormLanguage([
      { label: "अभ्यर्थी का पूरा नाम / Full Name of Candidate", kind: "name", formValue: "SANJAY KUMAR" },
    ], "hi-en"),
    "en-IN"
  );
  assert.equal(
    detectFormLanguage([
      { label: "अभ्यर्थी का पूरा नाम / Full Name of Candidate", kind: "name", formValue: "" },
    ], "hi-en"),
    "hi-IN"
  );
});
