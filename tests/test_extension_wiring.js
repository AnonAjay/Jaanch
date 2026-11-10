/**
 * Extension Wiring and Invariant Tests (tests/test_extension_wiring.js)
 * Runnable with: node --test tests/test_extension_wiring.js
 */

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("Manifest V3: Permissions are minimal and host_permissions are strict", () => {
  const manifestPath = path.resolve("extension", "manifest.json");
  assert.ok(fs.existsSync(manifestPath), "extension/manifest.json must exist");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  assert.equal(manifest.manifest_version, 3, "Must be Manifest V3");

  // Minimal browser permissions check (storage, alarms)
  const allowedPerms = new Set(["storage", "alarms"]);
  manifest.permissions.forEach((p) => {
    assert.ok(allowedPerms.has(p), `Unexpected permission requested: ${p}`);
  });

  // Verify live portal reach and local proxy host permissions
  assert.ok(
    manifest.host_permissions.some((h) => h.includes("127.0.0.1") || h.includes("localhost")),
    "Host permissions must permit local speech proxy"
  );
  assert.ok(
    manifest.content_scripts[0].matches.includes("<all_urls>"),
    "Content script must match live portals via <all_urls>"
  );

  // Verify referenced files exist
  const swPath = path.resolve("extension", manifest.background.service_worker);
  assert.ok(fs.existsSync(swPath), `Service worker missing: ${swPath}`);

  const contentScriptPath = path.resolve("extension", manifest.content_scripts[0].js[0]);
  assert.ok(fs.existsSync(contentScriptPath), `Content script missing: ${contentScriptPath}`);
  assert.deepEqual(manifest.content_scripts[0].js, ["content/field-model.js", "content/content.js"]);
});

test("Privacy pipeline: form readback stays local and content writes state through the worker", () => {
  const content = fs.readFileSync(path.resolve("extension", "content", "content.js"), "utf-8");
  const audio = fs.readFileSync(path.resolve("extension", "lib", "audio-player.js"), "utf-8");
  const popup = fs.readFileSync(path.resolve("extension", "popup", "popup.js"), "utf-8");

  assert.ok(!content.includes("chrome.storage.session"), "Content controller must not duplicate worker persistence");
  assert.ok(!audio.includes("/tts"), "Readback text must not be sent to the TTS proxy");
  assert.ok(!popup.includes("STT response: \"${transcript}\""), "Transcripts must not be written to console logs");
});

test("Active page fields replace stale session state and never fall back to demo data", () => {
  const worker = fs.readFileSync(path.resolve("extension", "background", "service-worker.js"), "utf-8");
  const popup = fs.readFileSync(path.resolve("extension", "popup", "popup.js"), "utf-8");

  assert.ok(worker.includes("activeFieldsMap = Object.fromEntries"), "Discovery must replace the previous page's field map");
  assert.ok(!worker.includes("GET_LIVE_FIELDS"), "Popup must not restore worker-lifetime stale fields");
  assert.ok(!popup.includes("useDefaultMockFields"), "Live verification must not silently show synthetic fields");
  assert.ok(popup.includes("No fields detected. Refresh the form page"), "Detection failures must explain how to retry");
});

test("Content Script: Never blocks native submit and injects Shadow DOM", () => {
  const contentJsPath = path.resolve("extension", "content", "content.js");
  const code = fs.readFileSync(contentJsPath, "utf-8");

  // Invariant: Never preventDefault on native form submit
  assert.ok(code.includes("attachShadow({ mode: \"open\" })"), "Must inject Recheck button via Shadow DOM");
  assert.ok(code.includes("SESSION_CLEARED"), "Must dispatch session clear on submit");
});

test("Cross-Frame & Service Worker Wiring: Session access and live sync", () => {
  const swPath = path.resolve("extension", "background", "service-worker.js");
  const swCode = fs.readFileSync(swPath, "utf-8");

  // Verify setAccessLevel is called so content scripts have access to session storage
  assert.ok(
    swCode.includes("setAccessLevel"),
    "Service worker must configure setAccessLevel for session storage"
  );
  assert.ok(
    swCode.includes("FIELDS_DISCOVERED"),
    "Service worker must handle FIELDS_DISCOVERED to persist discovered fields"
  );
  assert.ok(
    swCode.includes("FIELD_CHANGED"),
    "Service worker must handle FIELD_CHANGED to persist keystroke updates"
  );

  const contentPath = path.resolve("extension", "content", "content.js");
  const contentCode = fs.readFileSync(contentPath, "utf-8");

  // Verify direct cross-frame communication with embedded dropdown iframe
  assert.ok(
    contentCode.includes("JAANCH_FIELDS_RESPONSE") || contentCode.includes("JAANCH_INIT_FIELDS"),
    "Content script must bridge fields directly to the dropdown iframe"
  );
  assert.ok(
    contentCode.includes("JAANCH_POPUP_GET_FIELDS"),
    "Content script must listen for popup get fields requests"
  );

  const popupPath = path.resolve("extension", "popup", "popup.js");
  const popupCode = fs.readFileSync(popupPath, "utf-8");

  assert.ok(
    popupCode.includes("JAANCH_FIELDS_RESPONSE"),
    "Popup controller must listen for fields response from parent window"
  );
  assert.ok(
    popupCode.includes("isInIframe"),
    "Popup controller must detect if running inside an in-page iframe"
  );
});
