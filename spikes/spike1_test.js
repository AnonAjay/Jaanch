/**
 * Spike 1 Test: Validates that field discovery extracts the 4 target fields from form layout fixtures.
 */

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { discoverFieldsFromHtml } from "./spike1_field_reader.js";

test("Spike 1: Content script reads form fields correctly", () => {
  const portalPath = path.resolve("tests", "fixtures", "standard_form.html");
  assert.ok(fs.existsSync(portalPath), "Fixture tests/fixtures/standard_form.html must exist");

  const html = fs.readFileSync(portalPath, "utf-8");
  const fields = discoverFieldsFromHtml(html);

  console.log("\n[Spike 1 Evidence] Discovered Fields from Portal Layout:");
  fields.forEach(f => {
    console.log(` - ID: "${f.id}", Kind: "${f.kind}", Required: ${f.required}, Label: "${f.label}"`);
  });

  assert.equal(fields.length, 4, "Must discover exactly 4 critical form fields");

  const [nameField, dobField, districtField, refField] = fields;

  assert.equal(nameField.id, "applicant-name");
  assert.equal(nameField.kind, "name");
  assert.equal(nameField.required, true);

  assert.equal(dobField.id, "applicant-dob");
  assert.equal(dobField.kind, "date");
  assert.equal(dobField.required, true);

  assert.equal(districtField.id, "applicant-district");
  assert.equal(districtField.kind, "district");
  assert.equal(districtField.required, true);

  assert.equal(refField.id, "applicant-ref-no");
  assert.equal(refField.kind, "digits");
  assert.equal(refField.required, true);

  console.log("\n[Spike 1 Result]: PASS - All 4 fields, labels, kinds, and required flags accurately detected.");
});
