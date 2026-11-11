/**
 * Jaanch Evaluation Benchmark Runner (eval/run_eval.js)
 * Executes the 40 synthetic seeded-error form cases and 30 spoken reply scenarios.
 * Runnable with: node eval/run_eval.js
 */

import fs from "node:fs";
import path from "node:path";

import { devanagariToAscii, normalizeDigits } from "../extension/lib/normalize.js";
import { compareDates, compareDigits, compareName, compareDistrict } from "../extension/lib/compare.js";
import { classifyReply } from "../extension/lib/intents.js";

const CASES_PATH = path.resolve("eval", "cases", "cases.json");
const REPLIES_PATH = path.resolve("eval", "replies", "replies.json");
const RESULTS_DIR = path.resolve("eval", "results");

function runEvaluation() {
  console.log("===================================================================");
  console.log("       JAANCH EVALUATION SUITE: SYNTHETIC BENCHMARK RUN           ");
  console.log("===================================================================\n");

  if (!fs.existsSync(RESULTS_DIR)) {
    try {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    } catch (e) {}
  }

  const cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf-8"));
  const replies = JSON.parse(fs.readFileSync(REPLIES_PATH, "utf-8"));

  // -------------------------------------------------------------
  // Part A: 40 Seeded-Error Form Evaluation
  // -------------------------------------------------------------
  const typeStats = {
    digit_swap: { total: 0, detected: 0, missed: 0, notes: "Adjacent & middle digit transpositions" },
    day_month_swap: { total: 0, detected: 0, missed: 0, notes: "Day/month swapped (e.g. 12/03 vs 03/12)" },
    name_slip: { total: 0, detected: 0, missed: 0, notes: "Omitted, extra, or substituted letters" },
    district_mismatch: { total: 0, detected: 0, missed: 0, notes: "Wrong district selected (excludes valid aliases)" },
    clean_baseline: { total: 0, clean_passed: 0, false_flags: 0, notes: "Permissible variations: case, aliases, Devanagari" }
  };

  const detailedCaseResults = [];

  for (const c of cases) {
    const errorType = c.error_type;
    const p = c.profile;
    const e = c.entered;

    const resName = compareName(e.name, p.name);
    const resDob = compareDates(e.dob, p.dob);
    const resDist = compareDistrict(e.district, p.district);
    const resRef = compareDigits(e.ref_no, p.ref_no);

    const fieldResults = {
      "applicant-name": resName,
      "applicant-dob": resDob,
      "applicant-district": resDist,
      "applicant-ref-no": resRef
    };

    const hasMismatch = Object.values(fieldResults).some(r => r.status === "mismatch");

    if (errorType === "clean_baseline") {
      typeStats.clean_baseline.total++;
      if (hasMismatch) {
        typeStats.clean_baseline.false_flags++;
        detailedCaseResults.push({ id: c.id, type: errorType, pass: false, error: "False positive flag on clean form" });
      } else {
        typeStats.clean_baseline.clean_passed++;
        detailedCaseResults.push({ id: c.id, type: errorType, pass: true });
      }
    } else {
      typeStats[errorType].total++;
      const targetResult = fieldResults[c.target_field];
      const targetMismatch = targetResult && targetResult.status === "mismatch";

      if (targetMismatch) {
        typeStats[errorType].detected++;
        detailedCaseResults.push({ id: c.id, type: errorType, pass: true });
      } else {
        typeStats[errorType].missed++;
        detailedCaseResults.push({ id: c.id, type: errorType, pass: false, error: `Missed detection on ${c.target_field}` });
      }
    }
  }

  // -------------------------------------------------------------
  // Part B: 30 Spoken Reply Scenario Evaluation
  // -------------------------------------------------------------
  let correctIntents = 0;
  let correctValues = 0;
  let totalValuesExpected = 0;
  let zeroToleranceViolations = 0;

  const detailedReplyResults = [];

  for (const r of replies) {
    const classification = classifyReply(r.transcript, { targetKind: r.target_kind });
    const intentMatch = classification.intent === r.expected_intent;

    if (intentMatch) {
      correctIntents++;
    }

    let valueMatch = true;
    if (r.expected_value !== null) {
      totalValuesExpected++;
      valueMatch = classification.new_value &&
                   classification.new_value.toLowerCase() === r.expected_value.toLowerCase();
      if (valueMatch) {
        correctValues++;
      }
    }

    // Zero-tolerance invariant check:
    if (classification.new_value !== null) {
      const normVal = devanagariToAscii(classification.new_value).toLowerCase().replace(/[^a-z0-9]/g, "");
      const normTranscript = devanagariToAscii(r.transcript).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normTranscript.includes(normVal)) {
        zeroToleranceViolations++;
      }
    }

    detailedReplyResults.push({
      id: r.id,
      transcript: r.transcript,
      expected: r.expected_intent,
      actual: classification.intent,
      expected_value: r.expected_value,
      actual_value: classification.new_value,
      pass: intentMatch && valueMatch
    });
  }

  // -------------------------------------------------------------
  // Compute Rates
  // -------------------------------------------------------------
  const totalSeededErrorCases = cases.length - typeStats.clean_baseline.total;
  let totalDetectedErrors = 0;
  for (const k of ["digit_swap", "day_month_swap", "name_slip", "district_mismatch"]) {
    totalDetectedErrors += typeStats[k].detected;
  }
  const overallDetectionRate = ((totalDetectedErrors / totalSeededErrorCases) * 100).toFixed(1);
  const falseFlagRate = ((typeStats.clean_baseline.false_flags / typeStats.clean_baseline.total) * 100).toFixed(1);
  const intentAccuracy = ((correctIntents / replies.length) * 100).toFixed(1);

  // -------------------------------------------------------------
  // Formatted Output Table
  // -------------------------------------------------------------
  console.log("### A. Seeded-Error Form Evaluation (40 Cases)");
  console.log("| Error Type | Cases | Detected | Missed | Detection Rate | Notes |");
  console.log("|---|---|---|---|---|---|");
  for (const [key, s] of Object.entries(typeStats)) {
    if (key === "clean_baseline") {
      const rate = `${(((s.total - s.false_flags) / s.total) * 100).toFixed(0)}%`;
      console.log(`| **Clean Baseline (False-Flag Check)** | ${s.total} | ${s.total - s.false_flags} (Clean) | ${s.false_flags} (False Flags) | False-Flag Rate: ${falseFlagRate}% | ${s.notes} |`);
    } else {
      const rate = `${((s.detected / s.total) * 100).toFixed(0)}%`;
      const name = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      console.log(`| **${name}** | ${s.total} | ${s.detected} | ${s.missed} | ${rate} | ${s.notes} |`);
    }
  }

  console.log("\n### B. Spoken Reply Intent Evaluation (30 Scenarios)");
  console.log(`- Total Scenarios: ${replies.length}`);
  console.log(`- Correct Intent Classifications: ${correctIntents} / ${replies.length} (${intentAccuracy}%)`);
  console.log(`- Value Extractions: ${correctValues} / ${totalValuesExpected}`);
  console.log(`- Zero-Tolerance Violations (values outside transcript): ${zeroToleranceViolations} (Target: 0)`);

  const mdLines = [
    "# Jaanch Evaluation Report",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Form Cases: ${cases.length}`,
    `- Overall Detection Rate: ${overallDetectionRate}% (${totalDetectedErrors}/${totalSeededErrorCases} seeded errors)`,
    `- False Flag Rate: ${falseFlagRate}% (${typeStats.clean_baseline.false_flags}/${typeStats.clean_baseline.total} false flags)`,
    `- Intent Accuracy: ${intentAccuracy}% (${correctIntents}/${replies.length})`,
    `- Value Extractions: ${correctValues}/${totalValuesExpected}`,
    `- Zero Tolerance Violations: ${zeroToleranceViolations}`,
    "",
    "## Seeded-Error Breakdown",
    "",
    "| Error Type | Cases | Detected | Missed | Notes |",
    "|---|---|---|---|---|",
  ];
  for (const [key, s] of Object.entries(typeStats)) {
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    if (key === "clean_baseline") {
      mdLines.push(`| ${label} | ${s.total} | ${s.clean_passed} | ${s.false_flags} | ${s.notes} |`);
    } else {
      mdLines.push(`| ${label} | ${s.total} | ${s.detected} | ${s.missed} | ${s.notes} |`);
    }
  }
  const mdContent = `${mdLines.join("\n")}\n`;

  console.log("\n===================================================================");
  console.log(` OVERALL DETECTION RATE : ${overallDetectionRate}% (${totalDetectedErrors}/${totalSeededErrorCases} seeded errors)`);
  console.log(` FALSE FLAG RATE        : ${falseFlagRate}% (${typeStats.clean_baseline.false_flags}/${typeStats.clean_baseline.total} false flags)`);
  console.log(` INTENT ACCURACY        : ${intentAccuracy}% (${correctIntents}/${replies.length})`);
  console.log(` ZERO TOLERANCE STATUS  : ${zeroToleranceViolations === 0 ? "PASSED (100% compliant)" : "FAILED"}`);
  console.log("===================================================================\n");

  // Save JSON report
  const report = {
    timestamp: new Date().toISOString(),
    total_form_cases: cases.length,
    overall_detection_rate: `${overallDetectionRate}%`,
    false_flag_rate: `${falseFlagRate}%`,
    intent_accuracy: `${intentAccuracy}%`,
    zero_tolerance_violations: zeroToleranceViolations,
    form_type_stats: typeStats,
    detailed_cases: detailedCaseResults,
    detailed_replies: detailedReplyResults
  };

  try {
    const jsonOutPath = path.join(RESULTS_DIR, "eval_results.json");
    fs.writeFileSync(jsonOutPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`Saved JSON results to: ${jsonOutPath}`);
  } catch (err) {
    // Sandboxed environment may restrict direct Node writes
  }

  try {
    const mdOutPath = path.join(RESULTS_DIR, "EVAL_REPORT.md");
    fs.writeFileSync(mdOutPath, mdContent, "utf-8");
    console.log(`Saved Markdown results table to: ${mdOutPath}`);
  } catch (err) {
    // Sandboxed environment may restrict direct Node writes
  }
}

runEvaluation();
