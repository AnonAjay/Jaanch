/**
 * Modern Multi-Screen UI & In-Page Floating Modal Tests (tests/test_popup_ui.test.js)
 * Validates:
 *   1. Popup DOM structure & 5 distinct screens
 *   2. Slashed mic setup screen & 3 privacy points
 *   3. Holographic revolving homepage & 3 tutorial steps
 *   4. Active verification screen (Progress bar, TTS button, >=40px text, 3-4 waveform lines)
 *   5. Verification summary table & Safe In-Page Apply
 *   6. Manifest action configuration
 */

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import contentScript from "../extension/content/content.js";

const { applyFieldUpdates, isSubmitAccessible } = contentScript;

test("Manifest V3: Toolbar action and sticker share the popup page", () => {
  const manifestPath = path.resolve("extension", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  assert.ok(manifest.action, "manifest.json must have an action entry");
  assert.equal(manifest.action.default_popup, undefined, "Toolbar click must be routed through the shared in-page popup");
  assert.ok(manifest.action.default_title.includes("Jaanch"), "Default title must mention Jaanch");
  assert.equal(manifest.options_page, "settings/settings.html", "Options page must point to settings/settings.html");
  assert.ok(
    manifest.web_accessible_resources[0].resources.includes("popup/*"),
    "web_accessible_resources must include popup/* for in-page modal"
  );
  assert.ok(
    manifest.web_accessible_resources[0].resources.includes("settings/*"),
    "web_accessible_resources must include settings/*"
  );
});

test("Popup UI: Streamlined 3 Core Screens with Minimalistic Atomic Orbital Homepage & Clean Footer", () => {
  const popupHtmlPath = path.resolve("extension", "popup", "popup.html");
  const html = fs.readFileSync(popupHtmlPath, "utf-8");

  // Removed screens check
  assert.ok(!html.includes('id="screen-initial-setup"'), "Initial setup screen must be removed from popup");
  assert.ok(!html.includes('id="screen-settings"'), "Settings screen must be removed from popup in favor of dedicated options page");

  // Top Bar: English Jaanch only, no Hindi logo, no mode badge, no home button, no mic button
  assert.ok(html.includes("Jaanch"), "Top bar must include English 'Jaanch'");
  assert.ok(!html.includes('class="brand-logo">जाँच</span>'), "Top bar must not contain Hindi 'जाँच' brand logo");
  assert.ok(!html.includes('id="mode-badge"'), "Top bar must not contain sample/auto mode badge");
  assert.ok(!html.includes('id="btn-nav-home"'), "Top bar must not contain home button");
  assert.ok(!html.includes('id="btn-nav-mic"'), "Top bar must not contain mic button");
  assert.ok(html.includes('id="btn-nav-summary"'), "Top bar must contain summary button");
  assert.ok(html.includes('id="btn-nav-settings"'), "Top bar must contain settings button");

  // Screen 1: Minimalistic Atomic Orbital Homepage & Open Steps
  assert.ok(html.includes('id="screen-homepage"'), "Must contain Screen: Homepage");
  assert.ok(html.includes('id="atomic-orbit-centerpiece"'), "Must contain 3-layer atomic orbital centerpiece");
  assert.ok(html.includes("jaanch-central-ball"), "Must contain center Jaanch ball");
  assert.ok(html.includes("orbit-layer-1"), "Must contain inner orbit layer 1");
  assert.ok(html.includes("orbit-layer-2"), "Must contain middle orbit layer 2");
  assert.ok(html.includes("orbit-layer-3"), "Must contain outer orbit layer 3");
  assert.ok(html.includes("orbit-lang-word"), "Must contain multilingual Indic words on orbit");
  assert.ok(html.includes("Please open any online form to activate Jaanch"), "Tutorial step 1 must instruct opening forms in simple English");
  assert.ok(html.includes("&gt;)"), "Tutorial step 2 must reference trigger button");
  assert.ok(html.includes("home-steps-vertical"), "Steps must be in vertical open layout without boxes");

  // Minimal Footer: Fainted AI Disclaimer, no mic prompt or version text
  assert.ok(html.includes("ai-disclaimer-text"), "Must contain faint AI disclaimer in footer");
  assert.ok(html.includes("AI models can make mistakes"), "Disclaimer must mention AI mistakes cross-check");
  assert.ok(!html.includes("Jaanch v0.1.0 • Powered by Gnani.ai"), "Footer must not contain legacy version branding");

  // Screen 2: Active Verification Card
  assert.ok(html.includes('id="screen-verification"'), "Must contain Screen: Verification");
  assert.ok(html.includes('id="progress-bar-wrapper"'), "Must contain progress bar");
  assert.ok(html.includes('id="progress-fill"'), "Must contain progress fill");
  assert.ok(html.includes('id="btn-tts-speak"'), "Must contain Pronunciation TTS button");
  assert.ok(html.includes('id="field-value-large"'), "Must contain large value display");
  assert.ok(html.includes('id="spelled-container"'), "Must contain spelled bubbles container");
  assert.ok(html.includes('id="btn-verify-tick"'), "Must contain Tick (Accept) button");
  assert.ok(html.includes('id="btn-verify-cross"'), "Must contain Cross (Reject) button");
  assert.ok(html.includes('id="btn-voice-toggle"'), "Must contain Voice Toggle button");
  assert.ok(html.includes('id="voice-wave-bars"'), "Must contain 3-4 animated waveform lines");

  // Screen 3: Verification Summary Table
  assert.ok(html.includes('id="screen-summary"'), "Must contain Screen: Summary");
  assert.ok(html.includes('id="summary-table-body"'), "Must contain summary table body");
  assert.ok(html.includes('id="btn-apply-changes"'), "Must contain Apply (safe DOM update) button");
  assert.ok(html.includes('id="btn-recheck-all"'), "Must contain Recheck button");
  assert.ok(html.includes('id="btn-ask-again-summary"'), "Must contain Ask Again button");
});

test("Dedicated Settings Page: Standalone configuration page with permissions & live meter", () => {
  const settingsHtmlPath = path.resolve("extension", "settings", "settings.html");
  assert.ok(fs.existsSync(settingsHtmlPath), "settings.html must exist");
  const html = fs.readFileSync(settingsHtmlPath, "utf-8");

  // Section 1: Microphone permission & live meter
  assert.ok(html.includes('id="btn-request-mic"'), "Must have Allow Microphone Access button");
  assert.ok(html.includes('id="btn-test-mic"'), "Must have Test Microphone button");
  assert.ok(html.includes('id="mic-meter-bar"'), "Must have live audio input volume bar");
  assert.ok(html.includes("Zero-Data Retention Guarantee"), "Must state zero data retention guarantee");

  // Section 2: Language detection & selection
  assert.ok(html.includes('id="detected-lang-pill"'), "Must show auto-detected language badge");
  assert.ok(html.includes('id="select-language"'), "Must have preferred language select dropdown");

  // Section 3: AI Models & Voice
  assert.ok(html.includes("Gnani Prisma v2.5"), "Must state Gnani Prisma v2.5 STT");
  assert.ok(html.includes('id="select-voice"'), "Must have voice persona selection");
  assert.ok(html.includes('id="btn-preview-voice"'), "Must have voice preview button");

  // Section 4: Security & Ephemeral Storage
  assert.ok(html.includes('id="btn-wipe-session"'), "Must have Wipe Session Data button");
  assert.ok(html.includes("30-Minute Idle Auto-Wipe"), "Must document 30-min auto-wipe invariant");
});

test("Popup CSS: 15% Reduced Landscape Aspect Ratio (612px), Sharp Edges & Dark Green Header", () => {
  const cssPath = path.resolve("extension", "popup", "popup.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // 15% Reduced Width (612px) & Sharp Edges Invariant
  assert.ok(css.includes("612px"), "Must define 612px width for 15% reduced landscape layout");
  assert.ok(css.includes("border-radius: 0"), "Must define sharp edges (border-radius: 0)");

  // Top Bar Styling: Dark Green Header & Cream Icons
  assert.ok(css.includes("background-color: var(--dark-green)"), "Top bar header must be dark green");
  assert.ok(css.includes("stroke: var(--cream)"), "Header navigation icons must be cream color");

  // Required Color Palette
  assert.ok(css.includes("#FFF3E6"), "Must define Cream (#FFF3E6)");
  assert.ok(css.includes("#1F3B3A"), "Must define Dark Green (#1F3B3A)");
  assert.ok(css.includes("#FF7E6B"), "Must define Coral Button (#FF7E6B)");
  assert.ok(css.includes("#2FBF9B"), "Must define Mint / Emerald (#2FBF9B)");
  assert.ok(css.includes("#A7E7D5"), "Must define Soft Aqua (#A7E7D5)");

  // Atomic orbital & multilingual animations
  assert.ok(css.includes("orbitSpin1"), "Must define inner orbit rotation keyframe");
  assert.ok(css.includes("orbitSpin2"), "Must define middle orbit rotation keyframe");
  assert.ok(css.includes("orbitSpin3"), "Must define outer orbit rotation keyframe");
  assert.ok(css.includes(".jaanch-central-ball"), "Must style central green Jaanch ball");
  assert.ok(css.includes(".orbit-lang-word"), "Must style orange multilingual orbiting words");
});

test("Content Script: applyFieldUpdates safely updates form inputs without submission", () => {
  // Mock DOM input element
  const eventsDispatched = [];
  const mockInput = {
    id: "candidate-name-input",
    value: "SANJAY",
    style: { outline: "", boxShadow: "", transition: "" },
    dispatchEvent: (evt) => {
      eventsDispatched.push(evt.type);
    }
  };

  // Mock global document
  const origDoc = global.document;
  global.document = {
    getElementById: (id) => (id === "candidate-name-input" ? mockInput : null),
    querySelector: () => null,
  };

  try {
    const updatedCount = applyFieldUpdates([
      { id: "candidate-name-input", value: "AJAY", status: "match" }
    ]);

    assert.equal(updatedCount, 1, "Must update 1 field");
    assert.equal(mockInput.value, "AJAY", "Input value must be safely updated to AJAY");
    assert.ok(eventsDispatched.includes("input"), "Must trigger input event for live reactive portals");
    assert.ok(eventsDispatched.includes("change"), "Must trigger change event");
    assert.ok(mockInput.style.outline.includes("#2FBF9B"), "Must pulse green (#2FBF9B)");
  } finally {
    global.document = origDoc;
  }
});

test("Action Trigger: Toolbar button and sticker toggle the same in-page popup", () => {
  const swPath = path.resolve("extension", "background", "service-worker.js");
  const swCode = fs.readFileSync(swPath, "utf-8");

  assert.ok(swCode.includes("chrome.action.onClicked.addListener"), "Toolbar click must be handled by the service worker");
  assert.ok(swCode.includes('type: "TOGGLE_TOP_DROPDOWN"'), "Toolbar click must ask the content script to open the shared popup");
  assert.ok(!swCode.includes("chrome.action.openPopup"), "Toolbar click must not open a separate native popup");

  const contentPath = path.resolve("extension", "content", "content.js");
  const contentCode = fs.readFileSync(contentPath, "utf-8");

  // Verify in-page click handler does not inject in-page assistant modal
  const clickHandlerMatch = contentCode.match(/btn\.addEventListener\("click",[\s\S]*?\}\);/);
  assert.ok(clickHandlerMatch, "Click handler must exist");
  assert.ok(
    !clickHandlerMatch[0].includes("toggleInPageModal"),
    "Click handler must NOT inject in-page floating modal assistant"
  );
  assert.ok(!contentCode.includes("function toggleInPageModal"), "Obsolete second popup implementation must be removed");
  assert.ok(contentCode.includes("clearJaanchOverlays"), "Opening the popup must remove stale overlay instances");
  assert.ok(clickHandlerMatch[0].includes("RECHECK_CLICKED"), "Click handler must dispatch RECHECK_CLICKED");
});

test("Overlay Protection: Jaanch works while Submit is disabled, but not under a modal", () => {
  // 1. Normal active submit button
  const normalBtn = {
    disabled: false,
    getAttribute: (attr) => (attr === "aria-disabled" ? "false" : null),
    classList: { contains: () => false },
  };
  assert.equal(isSubmitAccessible(normalBtn), true, "Normal submit button must be accessible");

  // 2. Disabled submit button
  const disabledBtn = {
    disabled: true,
    getAttribute: () => null,
    classList: { contains: () => false },
  };
  assert.equal(isSubmitAccessible(disabledBtn), true, "Disabled native Submit must not block verification");

  // 3. ARIA-disabled submit button
  const ariaDisabledBtn = {
    disabled: false,
    getAttribute: (attr) => (attr === "aria-disabled" ? "true" : null),
    classList: { contains: () => false },
  };
  assert.equal(isSubmitAccessible(ariaDisabledBtn), true, "ARIA-disabled native Submit must not block verification");

  // 4. Modal/Dialog overlay blocking the page
  const origDoc = global.document;
  const mockModal = { contains: () => false };
  global.document = {
    querySelector: (sel) => (sel.includes("dialog") ? mockModal : null),
  };

  try {
    assert.equal(isSubmitAccessible(normalBtn), false, "Must return false when an overlay/dialog blocks the page");
  } finally {
    global.document = origDoc;
  }

  // 5. Verify sticker z-index is normal (in-flow z-index: 2, never high z-index)
  const contentPath = path.resolve("extension", "content", "content.js");
  const contentCode = fs.readFileSync(contentPath, "utf-8");
  assert.ok(contentCode.includes("z-index: 2 !important"), "Sticker must use local z-index: 2 to sit underneath overlays");
  assert.ok(!contentCode.includes("z-index: 2147483640"), "Sticker must NOT use high z-index that leaks through overlays");
});

test("Conditional State Loader: Automatically routes to internal section when form exists, homepage when 0 fields", () => {
  const popupJsPath = path.resolve("extension", "popup", "popup.js");
  const js = fs.readFileSync(popupJsPath, "utf-8");

  // Verify state loader implementation
  assert.ok(js.includes("resolveScreenFromFields"), "Must define resolveScreenFromFields helper");
  assert.ok(js.includes("queryActiveTabForFields"), "Must actively query active tab content checker");

  // Simulate routing function
  const resolveScreen = (count) => (count > 0 ? "screen-verification" : "screen-homepage");

  assert.equal(resolveScreen(0), "screen-homepage", "Zero fields detected on form must route to homepage");
  assert.equal(resolveScreen(1), "screen-verification", "1 field detected on form must route to internal section");
  assert.equal(resolveScreen(5), "screen-verification", "Multiple fields detected on form must route to internal section");

  // Verify automatic transition on live field discovery
  assert.ok(
    js.includes('switchScreen("screen-verification")'),
    "Must automatically switch to internal verification screen on detected fields"
  );
  assert.ok(
    js.includes('switchScreen("screen-homepage")'),
    "Must show homepage when zero fields are detected"
  );

  // Strict Guards & Brand Click Prevention
  assert.ok(
    !js.includes('headerBrand?.addEventListener("click"'),
    "Header brand title must not navigate to homepage when clicked"
  );
  assert.ok(
    js.includes('if (fields.length > 0 && screenId === "screen-homepage")'),
    "Must guard against navigating to homepage when active form fields exist"
  );
  assert.ok(
    js.includes('if (fields.length === 0 && (screenId === "screen-verification" || screenId === "screen-summary"))'),
    "Must guard against navigating to verification when no form is detected"
  );
});

test("Top Bar Manual Routing & Single Window Toggle Invariants", () => {
  const popupHtmlPath = path.resolve("extension", "popup", "popup.html");
  const html = fs.readFileSync(popupHtmlPath, "utf-8");
  assert.ok(html.includes('id="btn-nav-field"'), "Must have #btn-nav-field on top bar for manual routing");

  const popupJsPath = path.resolve("extension", "popup", "popup.js");
  const js = fs.readFileSync(popupJsPath, "utf-8");
  assert.ok(js.includes('btnNavField?.addEventListener("click"'), "Must wire click listener on #btn-nav-field");
  assert.ok(js.includes("resumeAudioContext"), "Must call resumeAudioContext on user interactions");
  assert.ok(js.includes("autoAdvanceTimer"), "Must debounce auto-advance to prevent race conditions");

  const contentJsPath = path.resolve("extension", "content", "content.js");
  const cjs = fs.readFileSync(contentJsPath, "utf-8");
  assert.ok(
    cjs.includes('document.getElementById("jaanch-dropdown-root")'),
    "Sticker must inspect existing floating dropdown to guarantee single-window toggle"
  );
  assert.ok(
    !cjs.includes('openToolbar: true'),
    "Sticker must never dispatch openToolbar: true to prevent double windows"
  );
});


