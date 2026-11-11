/**
 * Jaanch (जाँच) - Floating Popup Controller (extension/popup/popup.js)
 * Manages the 5 screens:
 *   1. Initial Setup / Mic Permission
 *   2. Holographic Homepage & Tutorial
 *   3. Active Field Verification (Progress, Large Text, Waveform, Quick Decision)
 *   4. Verification Summary Table & Safe DOM In-Page Apply
 *   5. Settings & Model Configuration
 */

import { devanagariToAscii, normalizeDigits, parseDate } from "../lib/normalize.js";
import { compareDates, compareDigits, compareName, compareDistrict } from "../lib/compare.js";
import { classifyReply } from "../lib/intents.js";
import {
  extractFieldsFromTranscript,
  evaluateFieldComparison,
  detectFormLanguage,
  getLanguageDisplayLabel,
} from "../lib/extractor.js";
import { tokenizeNameForReadback, tokenizeDigitsForReadback, tokenizeDateForReadback } from "../lib/spell.js";
import { playTTSPhrase, stopAudioPlayback, isAudioPlaying, resumeAudioContext } from "../lib/audio-player.js";
import { startContinuousListening, pauseContinuousListening, resumeContinuousListening, cancelVoiceCapture, startVoiceCapture, resumeVadAudioContext, isContinuousListeningActive, getVadState } from "../lib/vad.js";

const TTS_LANGUAGE = "hi-IN";

// State
let fields = [];
let currentFieldIndex = 0;
let isAudioPlayingState = false;
let isVoiceCapturing = false;
let continuousController = null;
let isMicPaused = true;
let isProxyReachable = null; // null = unknown, true/false = /health check result
let micPermission = "prompt"; // "prompt" | "granted" | "denied"
let currentScreenId = "screen-homepage";
let selectedLanguage = "hi-IN";
let detectedFormLanguage = "";
let pageLangHint = "";
let selectedVoice = "shivani";
let autoAdvanceTimer = null;
let hasLivePageFields = false;
let lastSavedFieldsSignature = "";

const jaanchSessionId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
  ? crypto.randomUUID()
  : `jaanch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const PROXY_URL = "http://127.0.0.1:8000";

// Screens (Streamlined to 3 views: Homepage, Verification, Summary)
const screens = {
  homepage: document.getElementById("screen-homepage"),
  verification: document.getElementById("screen-verification"),
  summary: document.getElementById("screen-summary")
};

// Top Navigation Elements
const btnNavField = document.getElementById("btn-nav-field");
const btnNavHome = document.getElementById("btn-nav-home");
const btnNavSummary = document.getElementById("btn-nav-summary");
const btnNavMic = document.getElementById("btn-nav-mic");
const btnNavSettings = document.getElementById("btn-nav-settings");
const headerBrand = document.getElementById("header-brand");
const modeBadge = document.getElementById("mode-badge");

// Progress Bar
const progressBarWrapper = document.getElementById("progress-bar-wrapper");
const fieldStep = document.getElementById("field-step");
const progressPercent = document.getElementById("progress-percent");
const progressFill = document.getElementById("progress-fill");

// Screen 1: Setup Elements
const btnAllowMic = document.getElementById("btn-allow-mic");
const btnDenyMic = document.getElementById("btn-deny-mic");

// Screen 2: Homepage Elements
const btnStartVerification = document.getElementById("btn-start-verification");
const homeDetectedCount = document.getElementById("home-detected-count");

// Screen 3: Active Verification Elements
const fieldLabel = document.getElementById("field-label");
const fieldKind = document.getElementById("field-kind");
const fieldStatusChip = document.getElementById("field-status-chip");
const fieldValueLarge = document.getElementById("field-value-large");
const fieldEditInput = document.getElementById("field-edit-input");
const sessionFormRef = document.getElementById("session-form-ref");
const spelledContainer = document.getElementById("spelled-container");
const btnTtsSpeak = document.getElementById("btn-tts-speak");
const btnTtsSpeakValue = document.getElementById("btn-tts-speak-value");
const btnPrevField = document.getElementById("btn-prev-field");
const btnNextField = document.getElementById("btn-next-field");

const waveformCanvas = document.getElementById("waveform-canvas");
const vadIndicator = document.getElementById("vad-indicator");
const heardContainer = document.getElementById("heard-container");
const heardTranscript = document.getElementById("heard-transcript");
const heardAction = document.getElementById("heard-action");

const btnVerifyTick = document.getElementById("btn-verify-tick");
const btnVerifyCross = document.getElementById("btn-verify-cross");
const btnVoiceToggle = document.getElementById("btn-voice-toggle");
const voiceIconPlay = document.getElementById("voice-icon-play");
const voiceIconStop = document.getElementById("voice-icon-stop");
const voiceWaveBars = document.getElementById("voice-wave-bars");
const voiceBtnSub = document.getElementById("voice-btn-sub");

// Hidden compatibility buttons for unit tests / fallback
const btnAccept = document.getElementById("btn-accept");
const btnKeep = document.getElementById("btn-keep");
const btnAskAgain = document.getElementById("btn-ask-again");
const btnPlayPrompt = document.getElementById("btn-play-prompt");
const btnClearSession = document.getElementById("btn-clear-session");

// Screen 4: Summary Elements
const summaryTableBody = document.getElementById("summary-table-body");
const summaryList = document.getElementById("summary-list");
const btnSummaryBack = document.getElementById("btn-summary-back");
const btnApplyChanges = document.getElementById("btn-apply-changes");
const btnRecheckAll = document.getElementById("btn-recheck-all");
const btnAskAgainSummary = document.getElementById("btn-ask-again-summary");
const applyFeedback = document.getElementById("apply-feedback");

// Screen 5: Settings Elements
const btnBackSettings = document.getElementById("btn-back-settings");
const selectLanguage = document.getElementById("select-language");
const selectVoice = document.getElementById("select-voice");
const micPermStatus = document.getElementById("mic-status-text");
const btnTestMic = document.getElementById("btn-test-mic");
const btnRerequestMic = document.getElementById("btn-rerequest-mic");
const btnWipeSessionNow = document.getElementById("btn-wipe-session-now");
const detectedLangBadge = document.getElementById("detected-lang-badge");

// Footer Elements
const micStatus = document.getElementById("mic-status");

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  setupNavigationHandlers();
  resetVoiceButtonUI();
  loadInitialState();
  checkProxyHealth();
  listenToSessionStorage();

  // Wake TTS AudioContext on first user gesture; keep mic paused unless explicitly toggled ON
  document.body.addEventListener("click", () => {
    resumeAudioContext();
    if (!isMicPaused) {
      resumeVadAudioContext();
    }
  }, { once: true });
});

// Refresh fields cleanly whenever popup gains focus without destroying Session DB edits
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    queryActiveTabForFields((detectedFields) => {
      if (detectedFields && Object.keys(detectedFields).length > 0) {
        const merged = mergeDetectedWithSession(detectedFields);
        updateFromStorage(merged, { preserveIndex: true });
        saveFieldsToSession();
        if (currentScreenId === "screen-homepage") {
          switchScreen("screen-verification", { force: true });
        } else {
          renderCurrentField();
          renderSummaryTable();
        }
      } else if (fields.length === 0) {
        showFieldDetectionMessage();
      }
    });
  });
}

function openSettingsPage() {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
  } else {
    window.open("../settings/settings.html", "_blank");
  }
}

function setupNavigationHandlers() {
  // Top Bar Manual Second Page Routing Pill
  btnNavField?.addEventListener("click", () => {
    resumeAudioContext();
    console.log(`[Jaanch Debug] Manual routing clicked (#btn-nav-field). Current screen: ${currentScreenId}, Fields: ${fields.length}`);
    if (currentScreenId === "screen-verification") {
      // Toggle back to homepage
      switchScreen("screen-homepage", { force: true });
    } else {
      // Verify only the active page's real fields.
      if (fields.length === 0) {
        queryActiveTabForFields((detectedFields) => {
          if (detectedFields && Object.keys(detectedFields).length > 0) {
            updateFromStorage(detectedFields);
            saveFieldsToSession();
            openVerificationScreen(true);
          } else {
            showFieldDetectionMessage();
          }
        });
        return;
      }
      currentFieldIndex = 0;
      switchScreen("screen-verification", { force: true });
      renderCurrentField();
      speakCurrentField();
    }
  });

  // Brand title is purely informational - does not navigate to homepage
  btnNavSummary?.addEventListener("click", () => {
    resumeAudioContext();
    if (fields.length === 0) return;
    if (currentScreenId === "screen-summary") {
      switchScreen("screen-verification");
      renderCurrentField();
    } else {
      switchScreen("screen-summary");
    }
  });
  btnNavSettings?.addEventListener("click", openSettingsPage);

  // Screen 1: Permissions (kept for fallback)
  btnAllowMic?.addEventListener("click", () => {
    resumeAudioContext();
    handleAllowMic();
  });
  btnDenyMic?.addEventListener("click", handleDenyMic);

  // Screen 2: Homepage
  const triggerStartVerification = () => {
    resumeAudioContext();
    console.log(`[Jaanch Debug] triggerStartVerification invoked. Current fields count: ${fields.length}`);
    if (fields.length > 0) {
      currentFieldIndex = 0;
      switchScreen("screen-verification", { force: true });
      renderCurrentField();
      speakCurrentField();
    } else {
      queryActiveTabForFields((detectedFields) => {
        const detectedCount = detectedFields ? Object.keys(detectedFields).length : 0;
        console.log(`[Jaanch Debug] triggerStartVerification active tab query returned: ${detectedCount} fields.`);
        if (detectedCount > 0) {
          updateFromStorage(detectedFields);
          saveFieldsToSession();
        } else {
          showFieldDetectionMessage();
          return;
        }
        openVerificationScreen(true);
      });
    }
  };
  btnStartVerification?.addEventListener("click", triggerStartVerification);
  document.getElementById("atomic-orbit-centerpiece")?.addEventListener("click", triggerStartVerification);

  // Screen 3: Verification
  btnTtsSpeak?.addEventListener("click", () => {
    resumeAudioContext();
    if (isAudioPlaying()) {
      stopAudioPlayback();
      if (btnTtsSpeak) btnTtsSpeak.classList.remove("active");
      if (btnTtsSpeakValue) btnTtsSpeakValue.classList.remove("active");
      if (vadIndicator) vadIndicator.textContent = "Audio stopped.";
    } else {
      speakCurrentFieldLabel();
    }
  });

  btnTtsSpeakValue?.addEventListener("click", () => {
    resumeAudioContext();
    if (isAudioPlaying()) {
      stopAudioPlayback();
      if (btnTtsSpeak) btnTtsSpeak.classList.remove("active");
      if (btnTtsSpeakValue) btnTtsSpeakValue.classList.remove("active");
      if (vadIndicator) vadIndicator.textContent = "Audio stopped.";
    } else {
      speakCurrentFieldValue();
    }
  });

  btnPrevField?.addEventListener("click", () => {
    resumeAudioContext();
    navigateField(-1);
  });
  btnNextField?.addEventListener("click", () => {
    resumeAudioContext();
    navigateField(1);
  });

  btnVerifyTick?.addEventListener("click", () => {
    resumeAudioContext();
    handleFieldDecision("match");
  });
  btnVerifyCross?.addEventListener("click", () => {
    resumeAudioContext();
    handleFieldDecision("mismatch");
  });
  btnVoiceToggle?.addEventListener("click", () => {
    resumeAudioContext();
    toggleVoiceRecording();
  });

  // Compatibility button triggers
  btnAccept?.addEventListener("click", () => handleFieldDecision("match"));
  btnKeep?.addEventListener("click", () => handleFieldDecision("match"));
  btnAskAgain?.addEventListener("click", () => handleFieldDecision("ask_again"));
  btnPlayPrompt?.addEventListener("click", () => speakCurrentField());
  btnClearSession?.addEventListener("click", () => wipeSessionData());

  // Screen 4: Summary
  btnSummaryBack?.addEventListener("click", () => switchScreen("screen-verification"));
  btnApplyChanges?.addEventListener("click", handleApplyChangesToForm);
  btnRecheckAll?.addEventListener("click", () => {
    currentFieldIndex = 0;
    fields.forEach((f) => { f.status = "not_checked"; });
    saveFieldsToSession();
    switchScreen("screen-verification");
    renderCurrentField();
    speakCurrentField();
  });
  btnAskAgainSummary?.addEventListener("click", () => {
    const unverifiedIdx = fields.findIndex((f) => f.status !== "match" && f.status !== "filled");
    if (unverifiedIdx !== -1) {
      currentFieldIndex = unverifiedIdx;
      switchScreen("screen-verification");
      renderCurrentField();
      speakCurrentField();
    } else if (applyFeedback) {
      applyFeedback.classList.remove("hidden");
      applyFeedback.textContent = "✓ All fields are already verified (सभी फ़ील्ड सत्यापित हैं).";
      setTimeout(() => applyFeedback.classList.add("hidden"), 2500);
    }
  });

  // Editable large input on Verification Screen (and hidden session-edit input sync)
  const handleInlineSessionEdit = (e) => {
    const current = fields[currentFieldIndex];
    if (!current) return;
    const nextVal = e.target.value;
    applyOperatorSessionEdit(current, nextVal);
    saveFieldsToSession();
    renderCurrentField({ skipInputSync: true });
  };
  fieldEditInput?.addEventListener("input", handleInlineSessionEdit);
  fieldEditInput?.addEventListener("change", handleInlineSessionEdit);
  fieldValueLarge?.addEventListener("input", (e) => {
    applyAdaptiveFontSize(fieldValueLarge, e.target.value);
    handleInlineSessionEdit(e);
    if (fieldEditInput) fieldEditInput.value = e.target.value;
  });
  fieldValueLarge?.addEventListener("change", (e) => {
    applyAdaptiveFontSize(fieldValueLarge, e.target.value);
    handleInlineSessionEdit(e);
    if (fieldEditInput) fieldEditInput.value = e.target.value;
  });

  // Settings handlers (if opened in embedded/mock mode)
  btnBackSettings?.addEventListener("click", () => {
    if (fields.length > 0) {
      switchScreen("screen-verification");
    } else {
      switchScreen("screen-homepage");
    }
  });

  selectLanguage?.addEventListener("change", (e) => {
    selectedLanguage = e.target.value;
    saveSetting("selectedLanguage", selectedLanguage);
  });

  selectVoice?.addEventListener("change", (e) => {
    selectedVoice = e.target.value;
    saveSetting("selectedVoice", selectedVoice);
  });

  btnTestMic?.addEventListener("click", testMicrophone);
  btnRerequestMic?.addEventListener("click", handleAllowMic);
  btnWipeSessionNow?.addEventListener("click", wipeSessionData);
}

function openVerificationScreen(shouldSpeak = false) {
  currentFieldIndex = 0;
  switchScreen("screen-verification", { force: true });
  renderCurrentField();
  if (shouldSpeak) speakCurrentField();
}

function showFieldDetectionMessage() {
  fields = [];
  currentFieldIndex = 0;
  hasLivePageFields = false;
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.remove("fields");
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "FIELDS_DISCOVERED", fields: [] }).catch(() => {});
  }
  if (homeDetectedCount) {
    homeDetectedCount.textContent = "No fields detected. Refresh the form page, then reopen Jaanch.";
  }
  updateNavVisibility();
  switchScreen("screen-homepage", { force: true });
}

/**
 * Updates top navigation visibility:
 * Summary button is available only when active fields exist.
 * Nav Field pill dynamically shows "Home (होम)" or "Verify (फ़ील्ड 1) →".
 */
function updateNavVisibility() {
  if (btnNavSummary) {
    if (fields.length > 0) {
      btnNavSummary.style.display = "inline-flex";
      btnNavSummary.removeAttribute("disabled");
      btnNavSummary.style.pointerEvents = "auto";
      btnNavSummary.style.opacity = "1";
    } else {
      btnNavSummary.style.display = "none";
      btnNavSummary.setAttribute("disabled", "true");
      btnNavSummary.style.pointerEvents = "none";
    }
  }

  if (btnNavField) {
    if (currentScreenId === "screen-verification") {
      btnNavField.textContent = "Home (होम)";
      btnNavField.classList.add("active");
      btnNavField.title = "Return to Homepage (होमपेज पर जाएं)";
    } else if (currentScreenId === "screen-homepage") {
      btnNavField.textContent = fields.length > 0 ? `Verify (${fields.length}) →` : "Verify (फ़ील्ड 1) →";
      btnNavField.classList.remove("active");
      btnNavField.title = "Jump to Verification (फ़ील्ड सत्यापन पर जाएं)";
    } else {
      btnNavField.textContent = "Verify (फ़ील्ड) →";
      btnNavField.classList.remove("active");
      btnNavField.title = "Back to Field Verification";
    }
  }
}

function switchScreen(screenId, options = {}) {
  console.log(`[Jaanch Debug] switchScreen called: target=${screenId}, force=${Boolean(options?.force)}, fieldsCount=${fields.length}, current=${currentScreenId}`);

  // If force is not requested, apply strict state guards
  if (!options?.force) {
    // Strict Guard 1: If fields exist (>0), user CANNOT navigate to homepage!
    if (fields.length > 0 && screenId === "screen-homepage") {
      console.warn("[Jaanch Debug] Navigation to homepage blocked: active form exists.");
      return;
    }

    // Strict Guard 2: If NO fields exist (==0), user CANNOT navigate to verification or summary!
    if (fields.length === 0 && (screenId === "screen-verification" || screenId === "screen-summary")) {
      console.warn("[Jaanch Debug] Navigation to verification/summary blocked: no form detected.");
      return;
    }
  }

  if (screenId !== "screen-verification" && !isMicPaused) {
    isMicPaused = true;
    pauseContinuousListening();
  }
  stopCurrentInteractions({
    keepVad: screenId === "screen-verification" && !isMicPaused,
    forceCancel: screenId === "screen-homepage",
  });
  currentScreenId = screenId;

  // Hide all screens
  Object.values(screens).forEach((scr) => {
    if (scr) {
      scr.classList.add("hidden");
      scr.classList.remove("active");
    }
  });

  // Remove nav button highlights
  [btnNavSummary, btnNavSettings].forEach((b) => b?.classList.remove("active"));

  // Show target screen
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }

  // Toggle progress bar visibility
  if (screenId === "screen-verification" && fields.length > 0) {
    progressBarWrapper?.classList.remove("hidden");
    updateProgressBar();
  } else {
    progressBarWrapper?.classList.add("hidden");
  }

  // Highlight active nav icon
  if (screenId === "screen-summary") {
    btnNavSummary?.classList.add("active");
    renderSummaryTable();
  }

  updateNavVisibility();
}

function updateProgressBar() {
  if (fields.length === 0) return;
  const currentNum = currentFieldIndex + 1;
  const total = fields.length;
  const pct = Math.round((currentNum / total) * 100);

  if (fieldStep) fieldStep.textContent = `Field ${currentNum} of ${total}`;
  if (progressPercent) progressPercent.textContent = `${pct}%`;
  if (progressFill) progressFill.style.width = `${pct}%`;
}

// -------------------------------------------------------------------
// CONDITIONAL STATE LOADER & ROUTING
// -------------------------------------------------------------------

const isInIframe = typeof window !== "undefined" && window.parent && window.parent !== window;

function mergeDetectedWithSession(detectedFields, savedMapOverride = null) {
  const existingMap = savedMapOverride || Object.fromEntries(fields.map((f) => [f.id, f]));
  const freshList = Array.isArray(detectedFields) ? detectedFields : Object.values(detectedFields || {});
  return Object.fromEntries(
    freshList
      .filter((field) => field?.id)
      .map((field) => {
        const freshFormVal = field.formValue !== undefined ? field.formValue : (field.value || "");
        const prev = existingMap[field.id];
        if (!prev) {
          return [field.id, { ...field, formValue: freshFormVal }];
        }
        const prevFormVal = prev.formValue !== undefined ? prev.formValue : (prev.value || "");
        const hasSessionEdits =
          prev.editedByUser ||
          (prev.status && prev.status !== "not_checked") ||
          Boolean(prev.extractedValue) ||
          Boolean(prev.pendingCorrection) ||
          Boolean(prev.heardTranscript);

        if (hasSessionEdits && prevFormVal === freshFormVal) {
          return [
            field.id,
            {
              ...field,
              ...prev,
              label: field.label || prev.label,
              required: field.required ?? prev.required,
              kind: field.kind || prev.kind,
              formValue: freshFormVal,
            },
          ];
        }
        return [field.id, { ...field, formValue: freshFormVal }];
      })
  );
}

function applyOperatorSessionEdit(fieldObj, nextValue) {
  if (!fieldObj) return;
  const valStr = String(nextValue ?? "");
  const trimmed = valStr.trim();
  const origFormVal = (fieldObj.formValue !== undefined ? fieldObj.formValue : "").trim();

  fieldObj.value = valStr;
  fieldObj.editedByUser = true;
  fieldObj.pendingCorrection = null;
  fieldObj.extractedValue = trimmed || null;
  fieldObj.updatedAt = Date.now();

  if (!trimmed) {
    fieldObj.status = origFormVal ? "mismatch" : "not_checked";
    fieldObj.decision = origFormVal ? "mismatch" : null;
  } else if (!origFormVal) {
    fieldObj.status = "filled";
    fieldObj.decision = null;
  } else {
    const cmp = evaluateFieldComparison(fieldObj, valStr);
    fieldObj.status = cmp.status === "match" ? "match" : "mismatch";
    fieldObj.decision = fieldObj.status === "match" ? "match" : null;
  }
}

function acceptLivePageFields(input, options = {}) {
  const list = Array.isArray(input) ? input : Object.values(input || {});
  if (options.pageLang !== undefined) {
    pageLangHint = options.pageLang || "";
  }
  if (list.length === 0) {
    hasLivePageFields = false;
    showFieldDetectionMessage();
    return false;
  }

  const fieldMap = options.reset ? Object.fromEntries(list.filter((f) => f?.id).map((f) => [f.id, f])) : mergeDetectedWithSession(list);
  if (Object.keys(fieldMap).length === 0) return false;

  hasLivePageFields = true;
  if (options.reset) currentFieldIndex = 0;
  updateFromStorage(fieldMap, { preserveIndex: !options.reset, pageLang: options.pageLang });
  saveFieldsToSession();
  if (currentScreenId === "screen-homepage" || options.reset) {
    switchScreen("screen-verification", { force: true });
  }
  renderCurrentField();
  return true;
}

/**
 * Pure helper to resolve the active screen based on detected field count:
 * - If fields exist (>0) -> "screen-verification" (internal section)
 * - If zero fields exist (==0) -> "screen-homepage"
 */
export function resolveScreenFromFields(fieldCount) {
  return fieldCount > 0 ? "screen-verification" : "screen-homepage";
}

/**
 * Conditional State Loader:
 * Checks whether there exists a form with fillable fields.
 * If a form exists, it automatically navigates to the internal section (screen-verification).
 * The homepage is strictly shown when zero fields are detected on the form.
 */
export async function loadInitialState() {
  console.log(`[Jaanch Debug] loadInitialState started. isInIframe=${isInIframe}`);

  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.get(
      ["fields", "micPermission", "selectedLanguage", "selectedVoice"],
      (res) => {
        micPermission = res?.micPermission || "prompt";
        selectedLanguage = res?.selectedLanguage || "hi-IN";
        selectedVoice = res?.selectedVoice || "shivani";

        if (selectLanguage) selectLanguage.value = selectedLanguage;
        if (selectVoice) selectVoice.value = selectedVoice;

        updateMicStatusBadge();

        // Notify parent host script if running inside embedded in-page iframe
        if (isInIframe) {
          try {
            window.parent.postMessage({ type: "JAANCH_POPUP_MOUNTED" }, "*");
          } catch (e) {}
        }

        // Always query active tab for fresh, up-to-date DOM input values
        queryActiveTabForFields((detectedFields) => {
          const detectedCount = detectedFields ? Object.keys(detectedFields).length : 0;
          console.log(`[Jaanch Debug] queryActiveTabForFields returned: ${detectedCount} fields.`);
          if (detectedCount > 0) {
            // Merge live DOM values cleanly with any saved Session DB state for identical fields
            const merged = mergeDetectedWithSession(detectedFields, res?.fields || {});
            updateFromStorage(merged);
            hasLivePageFields = true;
            saveFieldsToSession();
            switchScreen("screen-verification", { force: true });
            renderCurrentField();
          } else if (!hasLivePageFields) {
            // Never route a new page using fields left in session storage.
            showFieldDetectionMessage();
          }
        });
      }
    );
  } else {
    // Standalone fallback: route based on fields length
    const screen = resolveScreenFromFields(fields.length);
    switchScreen(screen);
    if (screen === "screen-verification") {
      renderCurrentField();
    }
  }
}

function listenToSessionStorage() {
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "session") {
        if (changes.selectedLanguage?.newValue) {
          selectedLanguage = changes.selectedLanguage.newValue;
          if (selectLanguage) selectLanguage.value = selectedLanguage;
        }
        if (changes.selectedVoice?.newValue) {
          selectedVoice = changes.selectedVoice.newValue;
          if (selectVoice) selectVoice.value = selectedVoice;
        }
        if (changes.fields) {
          const newFields = changes.fields.newValue;
          const count = newFields ? Object.keys(newFields).length : 0;
          if (count > 0) {
            const incomingSig = JSON.stringify(newFields);
            if (incomingSig === lastSavedFieldsSignature) return;
            updateFromStorage(newFields, { preserveIndex: true });
            if (currentScreenId === "screen-homepage") {
              switchScreen("screen-verification");
            } else {
              renderCurrentField();
              renderSummaryTable();
            }
          } else {
            fields = [];
            currentFieldIndex = 0;
            detectDefaultStatus();
            switchScreen("screen-homepage", { force: true });
          }
        }
        if (changes.micPermission) {
          micPermission = changes.micPermission.newValue;
          updateMicStatusBadge();
        }
      }
    });
  }

  // Single unified cross-frame listener for iframe <-> content script communication
  if (typeof window !== "undefined") {
    window.addEventListener("message", (event) => {
      if (isInIframe && event.source !== window.parent) return;

      if (event.data?.type === "JAANCH_INIT_FIELDS" || event.data?.type === "JAANCH_FIELDS_RESPONSE") {
        acceptLivePageFields(event.data.fields, {
          reset: Boolean(event.data.reset),
          pageLang: event.data.pageLang,
        });
      } else if (event.data?.type === "FIELD_CHANGED") {
        const { id, value } = event.data;
        let found = false;
        for (let i = 0; i < fields.length; i++) {
          if (fields[i].id === id) {
            fields[i].formValue = value;
            fields[i].value = value;
            fields[i].status = "not_checked";
            fields[i].decision = null;
            fields[i].pendingCorrection = null;
            fields[i].extractedValue = null;
            fields[i].heardTranscript = "";
            fields[i].editedByUser = false;
            found = true;
            break;
          }
        }
        if (found) {
          renderCurrentField();
          renderSummaryTable();
        } else {
          queryActiveTabForFields((fresh) => {
            if (fresh) {
              updateFromStorage(mergeDetectedWithSession(fresh), { preserveIndex: true });
              renderCurrentField();
            }
          });
        }
      }
    });
  }

  // Runtime message listener for live field discovery and real-time input changes from content script
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "FIELDS_DISCOVERED") {
        acceptLivePageFields(message.fields, {
          reset: Boolean(message.reset),
          pageLang: message.pageLang,
        });
      } else if (message.type === "FIELD_CHANGED") {
        const { id, value } = message;
        let found = false;
        for (let i = 0; i < fields.length; i++) {
          if (fields[i].id === id) {
            fields[i].formValue = value;
            fields[i].value = value;
            fields[i].status = "not_checked";
            fields[i].decision = null;
            fields[i].pendingCorrection = null;
            fields[i].extractedValue = null;
            fields[i].heardTranscript = "";
            fields[i].editedByUser = false;
            found = true;
            break;
          }
        }
        if (found) {
          renderCurrentField();
          renderSummaryTable();
        } else {
          queryActiveTabForFields((fresh) => {
            if (fresh) {
              updateFromStorage(mergeDetectedWithSession(fresh), { preserveIndex: true });
              renderCurrentField();
            }
          });
        }
      } else if (message.type === "SESSION_CLEARED") {
        fields = [];
        currentFieldIndex = 0;
        detectDefaultStatus();
        switchScreen("screen-homepage", { force: true });
      }
    });
  }
}

function queryActiveTabForFields(callback) {
  // 1. If running inside in-page floating dropdown iframe, query parent directly via postMessage
  if (isInIframe) {
    let resolved = false;
    const msgHandler = (event) => {
      if (
        (event.data?.type === "JAANCH_FIELDS_RESPONSE" || event.data?.type === "JAANCH_INIT_FIELDS") &&
        event.data.fields
      ) {
        resolved = true;
        if (event.data.pageLang !== undefined) {
          pageLangHint = event.data.pageLang || "";
        }
        window.removeEventListener("message", msgHandler);
        if (callback) callback(event.data.fields);
      }
    };
    window.addEventListener("message", msgHandler);
    try {
      window.parent.postMessage({ type: "JAANCH_POPUP_GET_FIELDS" }, "*");
    } catch (e) {}
    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener("message", msgHandler);
        if (callback) callback(null);
      }
    }, 700);
    return;
  }

  // 2. Toolbar popup: robust tab query with fallback to lastFocusedWindow
  if (typeof chrome !== "undefined" && chrome.tabs?.query) {
    const sendTabMessage = (tabId) => {
      chrome.tabs.sendMessage(tabId, { type: "GET_DISCOVERED_FIELDS" }, (response) => {
        if (chrome.runtime.lastError || !response?.fields) {
          if (callback) callback(null);
          return;
        }
        if (response.pageLang !== undefined) {
          pageLangHint = response.pageLang || "";
        }
        if (callback) callback(response.fields);
      });
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let activeTab = tabs && tabs[0];
      if (activeTab?.id) {
        sendTabMessage(activeTab.id);
      } else {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs2) => {
          activeTab = tabs2 && tabs2[0];
          if (activeTab?.id) {
            sendTabMessage(activeTab.id);
          } else {
            chrome.tabs.query({ active: true }, (tabs3) => {
              activeTab = tabs3 && tabs3[0];
              if (activeTab?.id) {
                sendTabMessage(activeTab.id);
              } else if (callback) {
                callback(null);
              }
            });
          }
        });
      }
    });
  } else {
    if (callback) callback(null);
  }
}

function detectDefaultStatus() {
  if (fields.length > 0) {
    if (homeDetectedCount) homeDetectedCount.textContent = `${fields.length} fields detected.`;
  } else {
    if (homeDetectedCount) homeDetectedCount.textContent = "No fields detected yet. Open a form tab.";
  }
}

function updateFromStorage(fieldMap, options = {}) {
  fields = Object.values(fieldMap || {});
  if (fields.length === 0) {
    if (homeDetectedCount) homeDetectedCount.textContent = "Waiting for form fields...";
    return;
  }
  if (homeDetectedCount) {
    homeDetectedCount.textContent = `${fields.length} fields ready to verify.`;
  }
  if (!options.preserveIndex || currentFieldIndex >= fields.length || currentFieldIndex < 0) {
    currentFieldIndex = 0;
  }
  
  // Detect language of the form itself (for STT & autofill, separate from Hindi TTS)
  detectLanguageFromFields(options.pageLang);
  renderCurrentField();
  renderSummaryTable();
  updateProgressBar();
}

function getSttLanguageCode() {
  return detectedFormLanguage || detectFormLanguage(fields, pageLangHint) || selectedLanguage || "en-IN";
}

function detectLanguageFromFields(explicitPageLang = undefined) {
  if (explicitPageLang !== undefined) {
    pageLangHint = explicitPageLang || "";
  }
  detectedFormLanguage = detectFormLanguage(fields, pageLangHint);
  saveSetting("detectedFormLanguage", detectedFormLanguage);

  if (detectedLangBadge) {
    detectedLangBadge.textContent = getLanguageDisplayLabel(detectedFormLanguage);
  }
  return detectedFormLanguage;
}

function saveSetting(key, val) {
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.set({ [key]: val });
  }
}

// -------------------------------------------------------------------
// SCREEN 1: MIC PERMISSION HANDLERS
// -------------------------------------------------------------------
async function handleAllowMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    micPermission = "granted";
    saveSetting("micPermission", "granted");
    updateMicStatusBadge();
    
    if (fields.length > 0) {
      switchScreen("screen-verification");
      speakCurrentField();
    } else {
      switchScreen("screen-homepage");
    }
  } catch (err) {
    console.warn("Microphone permission denied:", err);
    micPermission = "denied";
    saveSetting("micPermission", "denied");
    updateMicStatusBadge();
    if (vadIndicator) {
      vadIndicator.textContent = "⚠️ Mic Blocked! Click browser address bar icon to allow.";
      vadIndicator.className = "vad-indicator speaking";
    }
    switchScreen("screen-homepage");
  }
}

function handleDenyMic() {
  micPermission = "denied";
  saveSetting("micPermission", "denied");
  updateMicStatusBadge();
  switchScreen("screen-homepage");
}

function updateMicStatusBadge() {
  if (micPermission === "granted") {
    if (micStatus) micStatus.textContent = "Mic: Ready (सक्रिय)";
    if (micPermStatus) {
      micPermStatus.textContent = "Granted / Ready";
      micPermStatus.className = "status-indicator ready";
    }
  } else if (micPermission === "denied") {
    if (micStatus) micStatus.textContent = "Mic: Denied (अस्वीकृत)";
    if (micPermStatus) {
      micPermStatus.textContent = "Denied / Inactive";
      micPermStatus.className = "status-indicator denied";
    }
  } else {
    if (micStatus) micStatus.textContent = "Mic: Prompt";
    if (micPermStatus) {
      micPermStatus.textContent = "Not Requested Yet";
      micPermStatus.className = "status-indicator";
    }
  }
}

async function testMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setTimeout(() => {
      stream.getTracks().forEach((t) => t.stop());
      if (vadIndicator) {
        vadIndicator.textContent = "✓ Microphone test successful! Audio input is working.";
        vadIndicator.className = "vad-indicator idle";
      }
    }, 1500);
  } catch (err) {
    if (vadIndicator) {
      vadIndicator.textContent = `⚠️ Microphone test failed: ${err.message}`;
      vadIndicator.className = "vad-indicator speaking";
    }
  }
}

// -------------------------------------------------------------------
// SCREEN 3: VERIFICATION FLOW & RENDERING
// -------------------------------------------------------------------

/**
 * Dynamically scales typography according to value length so both short names
 * and long institutions/addresses render cleanly without clipping.
 */
function applyAdaptiveFontSize(el, text) {
  if (!el) return;
  const len = (text || "").trim().length;
  el.classList.remove("size-short", "size-medium", "size-long", "size-xlong");
  if (len <= 12) {
    el.classList.add("size-short");
  } else if (len <= 24) {
    el.classList.add("size-medium");
  } else if (len <= 42) {
    el.classList.add("size-long");
  } else {
    el.classList.add("size-xlong");
  }

  if (el.tagName === "TEXTAREA") {
    el.style.height = "auto";
    // Generous buffer to prevent clipping of descenders ('g', 'j', 'y', 'p', 'q')
    const newHeight = Math.max(el.scrollHeight + 8, 48);
    el.style.height = `${newHeight}px`;
  }
}

function renderCurrentField(options = {}) {
  if (!fields[currentFieldIndex]) return;
  const current = fields[currentFieldIndex];
  const displayVal = current.value || "";

  const fieldNumberEl = document.getElementById("field-number");
  if (fieldNumberEl) fieldNumberEl.textContent = `${currentFieldIndex + 1}.)`;

  if (fieldLabel) fieldLabel.textContent = current.label || current.id;
  if (fieldKind) fieldKind.textContent = (current.kind || "text").toUpperCase();
  if (fieldValueLarge && !options.skipInputSync) {
    if (typeof document === "undefined" || document.activeElement !== fieldValueLarge) {
      if ("value" in fieldValueLarge) {
        fieldValueLarge.value = displayVal;
      } else {
        fieldValueLarge.textContent = displayVal || "— (Blank / खाली)";
      }
    }
  }
  if (fieldValueLarge) {
    applyAdaptiveFontSize(fieldValueLarge, displayVal);
  }

  if (fieldEditInput && !options.skipInputSync) {
    if (typeof document === "undefined" || document.activeElement !== fieldEditInput) {
      fieldEditInput.value = displayVal;
    }
  }

  if (sessionFormRef) {
    const origForm = (current.formValue !== undefined ? current.formValue : "").trim();
    const curTrim = displayVal.trim();
    if (!origForm && curTrim) {
      sessionFormRef.textContent = `Unfilled on form → Session DB: "${curTrim}"`;
      sessionFormRef.classList.remove("hidden");
    } else if (origForm && curTrim && origForm !== curTrim) {
      sessionFormRef.textContent = `Form value: "${origForm}" → Session DB: "${curTrim}"`;
      sessionFormRef.classList.remove("hidden");
    } else {
      sessionFormRef.classList.add("hidden");
      sessionFormRef.textContent = "";
    }
  }

  const remainingEl = document.getElementById("field-remaining-count");
  if (remainingEl) {
    const remaining = fields.length - (currentFieldIndex + 1);
    remainingEl.textContent = remaining > 0 ? `${remaining} remaining` : "Last field";
  }

  if (fieldStatusChip) {
    fieldStatusChip.className = `chip ${current.status || "not-checked"}`;
    fieldStatusChip.textContent = formatStatus(current.status);
  }

  renderSpelledBubbles(displayVal, current.kind);
  updateProgressBar();

  if (btnPrevField) btnPrevField.disabled = currentFieldIndex === 0;
  if (btnNextField) btnNextField.disabled = currentFieldIndex === fields.length - 1;

  if (current.heardTranscript) {
    heardContainer?.classList.remove("hidden");
    if (heardTranscript) heardTranscript.textContent = `"${current.heardTranscript}"`;
    if (heardAction) {
      if (current.pendingCorrection) {
        heardAction.innerHTML = `Extracted: <strong>${current.pendingCorrection}</strong>`;
      } else if (current.status === "filled" && current.extractedValue) {
        heardAction.innerHTML = `Filled: <strong>${current.extractedValue}</strong>`;
      } else if (current.instruction) {
        heardAction.innerHTML = `Instruction: <strong>${current.instruction}</strong>`;
      } else {
        heardAction.innerHTML = `Intent: <strong>${current.intent || "—"}</strong>`;
      }
    }
  } else {
    heardContainer?.classList.add("hidden");
  }

  // Automatically prime continuous listening when viewing a field
  if (!isMicPaused) {
    ensureContinuousListening();
  }
}

function formatStatus(status) {
  switch (status) {
    case "match": return "MATCH";
    case "filled": return "FILLED";
    case "mismatch": return "MISMATCH";
    case "unsure": return "UNSURE";
    default: return "NOT CHECKED";
  }
}

function renderSpelledBubbles(value, kind) {
  if (!spelledContainer) return;
  spelledContainer.innerHTML = "";
  if (!value) return;

  if (kind === "name") {
    const letters = value.replace(/[^A-Za-z]/g, "").toUpperCase().split("");
    letters.forEach((char, idx) => {
      const bubble = document.createElement("span");
      bubble.className = "letter-bubble";
      bubble.id = `bubble-char-${idx}`;
      bubble.textContent = char;
      spelledContainer.appendChild(bubble);
    });
  } else if (kind === "digits") {
    const digits = normalizeDigits(value).split("");
    digits.forEach((digit, idx) => {
      const bubble = document.createElement("span");
      bubble.className = "letter-bubble";
      bubble.id = `bubble-digit-${idx}`;
      bubble.textContent = digit;
      spelledContainer.appendChild(bubble);
    });
  }
}

function navigateField(delta) {
  const newIndex = currentFieldIndex + delta;
  if (newIndex >= 0 && newIndex < fields.length) {
    stopCurrentInteractions();
    currentFieldIndex = newIndex;
    renderCurrentField();
  }
}

function stopCurrentInteractions(options = {}) {
  stopAudioPlayback();
  btnTtsSpeak?.classList.remove("active");
  btnTtsSpeakValue?.classList.remove("active");
  isMicPaused = true;
  if (continuousController) {
    if (options.forceCancel) {
      cancelVoiceCapture();
      continuousController = null;
    } else {
      pauseContinuousListening();
    }
  }
  isAudioPlayingState = false;
  isVoiceCapturing = false;
  resetVoiceButtonUI();
  if (vadIndicator) {
    vadIndicator.textContent = "Mic paused (TTS mode) — Tap Paused to speak edits";
    vadIndicator.className = "vad-indicator idle";
  }
}

function resetVoiceButtonUI() {
  voiceIconPlay?.classList.remove("hidden");
  voiceIconStop?.classList.add("hidden");
  voiceWaveBars?.classList.add("hidden");
  btnVoiceToggle?.classList.remove("recording");
  btnVoiceToggle?.classList.toggle("muted", isMicPaused);
  if (voiceBtnSub) voiceBtnSub.textContent = isMicPaused ? "Paused" : "Auto";
}

/**
 * Natural Spoken Hindi Phrase Generator for Timbre TTS
 */
function getFieldSpeechPhrase(field) {
  const val = (field.value || "").trim();
  const cleanLabel = (field.label || field.id).split("/")[0].trim();
  if (!val) {
    return `${cleanLabel}: खाली है। क्या आप जानकारी दर्ज करना चाहते हैं?`;
  }
  if (field.kind === "name") {
    return `अभ्यर्थी का नाम: ${val}। क्या यह सही है?`;
  } else if (field.kind === "date") {
    return `जन्म तिथि: ${val}। क्या यह सही है?`;
  } else if (field.kind === "digits") {
    return `नंबर: ${val}। क्या यह सही है?`;
  } else if (field.kind === "district") {
    return `जिला: ${val}। क्या यह सही है?`;
  }
  return `${cleanLabel}: ${val}। क्या यह सही है?`;
}

/**
 * Ensures continuous background listening is active with instant barge-in
 */
async function ensureContinuousListening(force = false) {
  if (isMicPaused) return false;
  if (!force && continuousController && isContinuousListeningActive()) return true;

  try {
    continuousController = await startContinuousListening({
      isAudioPlayingRef: () => isAudioPlaying(),
      onLevelChange: (rms) => {
        // Visual feedback when sound enters the mic
        if (rms > 0.008 && !isVoiceCapturing) {
          voiceWaveBars?.classList.remove("hidden");
          voiceIconPlay?.classList.add("hidden");
        } else if (rms <= 0.008 && !isVoiceCapturing) {
          voiceWaveBars?.classList.add("hidden");
          voiceIconPlay?.classList.remove("hidden");
        }
      },
      onSpeechStart: () => {
        // INSTANT BARGE-IN: Immediately silence the speaker when citizen speaks!
        stopAudioPlayback();
        if (btnTtsSpeak) btnTtsSpeak.classList.remove("active");
        isVoiceCapturing = true;
        btnVoiceToggle?.classList.add("recording");
        voiceWaveBars?.classList.remove("hidden");
        voiceIconPlay?.classList.add("hidden");
        voiceIconStop?.classList.remove("hidden");
        if (voiceBtnSub) voiceBtnSub.textContent = "Listening";
        if (vadIndicator) {
          vadIndicator.textContent = "Customer speaking... (सुन रहे हैं)";
          vadIndicator.className = "vad-indicator speaking";
        }
      },
      onSpeechEnd: async (wavBlob) => {
        // Auto-off after single utterance so TTS readback on the next question stays undisturbed
        isMicPaused = true;
        isVoiceCapturing = false;
        pauseContinuousListening();
        resetVoiceButtonUI();
        if (vadIndicator) {
          vadIndicator.textContent = "Processing reply... (जाँच जारी है)";
          vadIndicator.className = "vad-indicator idle";
        }

        await processAudioReply(wavBlob);
      }
    });

    if (voiceBtnSub) voiceBtnSub.textContent = "Auto";
    btnVoiceToggle?.classList.remove("muted", "recording");
    return true;
  } catch (err) {
    console.warn("[Jaanch Mic] Continuous mic init:", err?.message);
    isMicPaused = true;
    resetVoiceButtonUI();
    if (vadIndicator) {
      vadIndicator.textContent = "⚠️ Mic Blocked! Click browser address bar icon to allow.";
      vadIndicator.className = "vad-indicator speaking";
    }
    return false;
  }
}

/**
 * Speaks the field name/identifier (top speaker icon next to title)
 */
async function speakCurrentFieldLabel() {
  const current = fields[currentFieldIndex];
  if (!current) return;

  resumeAudioContext();
  if (isAudioPlaying()) {
    stopAudioPlayback();
    btnTtsSpeak?.classList.remove("active");
    btnTtsSpeakValue?.classList.remove("active");
    return;
  }

  if (!isMicPaused || isVoiceCapturing) {
    isMicPaused = true;
    isVoiceCapturing = false;
    pauseContinuousListening();
    resetVoiceButtonUI();
  }

  stopAudioPlayback();
  btnTtsSpeakValue?.classList.remove("active");
  btnTtsSpeak?.classList.add("active");

  const cleanLabel = (current.label || current.id).split("/")[0].trim();
  let phrase = cleanLabel;
  if (current.kind === "name") {
    phrase = "अभ्यर्थी का नाम";
  } else if (current.kind === "date") {
    phrase = "जन्म तिथि";
  } else if (current.kind === "digits") {
    phrase = cleanLabel ? `नंबर: ${cleanLabel}` : "नंबर";
  } else if (current.kind === "district") {
    phrase = "जिला";
  }

  await playTTSPhrase(phrase, {
    voice: selectedVoice,
    lang: TTS_LANGUAGE,
    proxyUrl: PROXY_URL,
    onStart: () => {
      btnTtsSpeak?.classList.add("active");
    },
    onEnd: () => {
      btnTtsSpeak?.classList.remove("active");
    }
  });

  btnTtsSpeak?.classList.remove("active");
}

/**
 * Speaks what is inside the whole editable text (trailing foot speaker icon)
 */
async function speakCurrentFieldValue() {
  const current = fields[currentFieldIndex];
  if (!current) return;

  resumeAudioContext();
  if (isAudioPlaying()) {
    stopAudioPlayback();
    btnTtsSpeak?.classList.remove("active");
    btnTtsSpeakValue?.classList.remove("active");
    return;
  }

  if (!isMicPaused || isVoiceCapturing) {
    isMicPaused = true;
    isVoiceCapturing = false;
    pauseContinuousListening();
    resetVoiceButtonUI();
  }

  stopAudioPlayback();
  btnTtsSpeak?.classList.remove("active");
  btnTtsSpeakValue?.classList.add("active");

  const liveVal = (fieldValueLarge && typeof fieldValueLarge.value === "string")
    ? fieldValueLarge.value.trim()
    : (current.value || "").trim();

  const phrase = liveVal || "खाली है";

  await playTTSPhrase(phrase, {
    voice: selectedVoice,
    lang: TTS_LANGUAGE,
    proxyUrl: PROXY_URL,
    onStart: () => {
      btnTtsSpeakValue?.classList.add("active");
    },
    onEnd: () => {
      btnTtsSpeakValue?.classList.remove("active");
    }
  });

  btnTtsSpeakValue?.classList.remove("active");
}

/**
 * Natural Fluent TTS with Instant Barge-In Interruption
 */
async function speakCurrentField() {
  const current = fields[currentFieldIndex];
  if (!current) return;

  // Ensure mic is paused during TTS verification so readback is never interrupted
  if (!isMicPaused || isVoiceCapturing) {
    isMicPaused = true;
    isVoiceCapturing = false;
    pauseContinuousListening();
    resetVoiceButtonUI();
  }

  stopAudioPlayback();
  const phrase = getFieldSpeechPhrase(current);

  if (vadIndicator) {
    vadIndicator.textContent = "Speaking details... (बोल रहे हैं)";
    vadIndicator.className = "vad-indicator idle";
  }
  if (btnTtsSpeak) btnTtsSpeak.classList.add("active");

  await playTTSPhrase(phrase, {
    voice: selectedVoice,
    lang: TTS_LANGUAGE,
    proxyUrl: PROXY_URL,
    onStart: () => {
      if (btnTtsSpeak) btnTtsSpeak.classList.add("active");
    },
    onEnd: () => {
      if (btnTtsSpeak) btnTtsSpeak.classList.remove("active");
      if (vadIndicator && !isVoiceCapturing) {
        vadIndicator.textContent = isMicPaused
          ? "Mic paused (TTS mode) — Tap Paused to speak edits"
          : "Listening for reply... (सुन रहे हैं)";
        vadIndicator.className = "vad-indicator idle";
      }
    }
  });

  if (btnTtsSpeak) btnTtsSpeak.classList.remove("active");
}

/**
 * Voice Capture Toggle Button: Toggles Pause (TTS verify) / Auto (single-turn STT edit)
 */
async function toggleVoiceRecording() {
  resumeAudioContext();
  const sttLang = getSttLanguageCode();

  if (isMicPaused) {
    stopAudioPlayback();
    isMicPaused = false;
    await resumeVadAudioContext();
    await resumeContinuousListening();
    const vadState = getVadState();
    const needStart = !continuousController || !vadState.listening || !isContinuousListeningActive();
    const started = await ensureContinuousListening(needStart);
    if (!started) return;

    btnVoiceToggle?.classList.remove("muted");
    if (voiceBtnSub) voiceBtnSub.textContent = "Auto";
    if (vadIndicator) {
      vadIndicator.textContent = `Listening (${sttLang})... Speak now (बोलिए)`;
      vadIndicator.className = "vad-indicator idle";
    }
    checkProxyHealth().then((online) => {
      if (!online && !isMicPaused && !isVoiceCapturing && vadIndicator) {
        vadIndicator.textContent = "Mic ON, speech proxy offline (127.0.0.1:8000). Start proxy/main.py or edit Session DB.";
        vadIndicator.className = "vad-indicator speaking";
      }
    });
    return;
  }

  const resumed = await resumeVadAudioContext();
  const vadState = getVadState();

  // If VAD was not running yet (or AudioContext just woke up), arm continuous listening instead of pausing
  if (!continuousController || (!resumed && !vadState.listening) || !isContinuousListeningActive()) {
    isMicPaused = false;
    const started = await ensureContinuousListening(true);
    if (!started) return;
    btnVoiceToggle?.classList.remove("muted");
    if (voiceBtnSub) voiceBtnSub.textContent = "Auto";
    if (vadIndicator) {
      vadIndicator.textContent = `Listening (${sttLang})... Speak now (बोलिए)`;
      vadIndicator.className = "vad-indicator idle";
    }
  } else {
    // Already actively capturing: clicking again pauses mic back into TTS-verify mode
    isMicPaused = true;
    isVoiceCapturing = false;
    pauseContinuousListening();
    stopAudioPlayback();
    resetVoiceButtonUI();
    if (vadIndicator) {
      vadIndicator.textContent = "Mic paused (TTS mode) — Tap Paused to speak edits";
      vadIndicator.className = "vad-indicator idle";
    }
  }
}

async function listenForCustomerReply() {
  isMicPaused = false;
  await resumeVadAudioContext();
  await ensureContinuousListening(true);
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function sendProxyRuntimeMessage(payload) {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve(null);
      return;
    }
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, networkError: true, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || null);
    });
  });
}

async function requestSttTranscript(wavBlob) {
  const sttLanguage = getSttLanguageCode();
  try {
    const formData = new FormData();
    formData.append("audio_file", wavBlob, "reply.wav");
    formData.append("language_code", sttLanguage);

    const resp = await fetch(`${PROXY_URL}/stt`, {
      method: "POST",
      headers: {
        "X-Session-ID": jaanchSessionId,
      },
      body: formData,
      signal: AbortSignal.timeout(12000),
    });

    let data = null;
    try {
      data = await resp.json();
    } catch (e) {}
    return {
      ok: resp.ok,
      status: resp.status,
      data,
      detail: data?.detail || (resp.ok ? "" : `HTTP ${resp.status}`),
    };
  } catch (directErr) {
    // Embedded https:// iframes can have loopback fetches blocked by PNA/Mixed-Content; relay via MV3 worker
    const wavBase64 = await blobToBase64(wavBlob);
    const relayed = await sendProxyRuntimeMessage({
      type: "PROXY_STT",
      proxyUrl: PROXY_URL,
      wavBase64,
      languageCode: sttLanguage,
      sessionId: jaanchSessionId,
    });
    if (relayed && typeof relayed.status === "number") {
      return relayed;
    }
    return { ok: false, networkError: true, error: relayed?.error || directErr?.message };
  }
}

async function processAudioReply(wavBlob) {
  const current = fields[currentFieldIndex];
  if (!current) return;

  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }

  let transcript = "";
  let sttErrorMsg = "";
  const sttRes = await requestSttTranscript(wavBlob);

  if (sttRes.ok) {
    isProxyReachable = true;
    transcript = (sttRes.data?.transcript || "").trim();
  } else if (sttRes.networkError || !sttRes.status) {
    isProxyReachable = false;
    console.warn("[Jaanch Audio Debug] STT network error");
    sttErrorMsg = "Speech proxy unreachable (127.0.0.1:8000). Start proxy/main.py or edit Session DB below.";
  } else {
    isProxyReachable = true;
    const detail = sttRes.detail || `HTTP ${sttRes.status}`;
    console.warn(`[Jaanch Audio Debug] STT failure ${sttRes.status}`);
    if (sttRes.status === 402) {
      sttErrorMsg = "Daily speech budget reached. Type edit directly in Session DB below.";
    } else if (sttRes.status === 400) {
      sttErrorMsg = "Audio clip too short/noisy. Speak clearly and try again.";
    } else {
      sttErrorMsg = `Speech service error (${detail}). You can type directly below.`;
    }
  }

  if (sttErrorMsg) {
    if (vadIndicator) {
      vadIndicator.textContent = sttErrorMsg;
      vadIndicator.className = "vad-indicator speaking";
    }
    return;
  }

  if (!transcript) {
    if (vadIndicator) {
      vadIndicator.textContent = "Speech heard, but no words recognized. Speak clearly or edit Session DB below.";
      vadIndicator.className = "vad-indicator idle";
    }
    return;
  }

  // Deterministic pipeline stage: STT -> Small Field Extractor -> Editable Session DB
  const extraction = extractFieldsFromTranscript(transcript, fields, {
    activeFieldId: current.id,
    currentIndex: currentFieldIndex,
    formLanguage: getSttLanguageCode(),
  });

  // 1. Repeat request
  if (extraction.action === "repeat") {
    current.heardTranscript = transcript;
    current.intent = "repeat";
    renderCurrentField();
    if (vadIndicator) vadIndicator.textContent = "Repeating prompt (पुनः सुनिए)...";
    setTimeout(() => speakCurrentField(), 450);
    return;
  }

  // 2. Hold request
  if (extraction.action === "hold") {
    current.heardTranscript = transcript;
    current.intent = "hold";
    renderCurrentField();
    if (vadIndicator) vadIndicator.textContent = "Hold requested (रुके हैं)... Speak or edit when ready.";
    return;
  }

  // 3. Apply extractor updates into Editable Session DB
  if (extraction.updates && extraction.updates.length > 0) {
    const updatedFields = [];
    for (const u of extraction.updates) {
      const targetField = fields.find((f) => f.id === u.fieldId);
      if (!targetField) continue;

      targetField.transcript = transcript;
      targetField.heardTranscript = transcript;
      targetField.intent = u.intent;
      targetField.instruction = u.instruction || null;
      targetField.extractedValue = u.extractedValue;
      targetField.decision = u.decision;
      targetField.editedByUser = false;
      targetField.updatedAt = Date.now();

      if (u.intent === "correct_instruction") {
        targetField.status = "mismatch";
        targetField.pendingCorrection = u.extractedValue || null;
        if (u.extractedValue) {
          targetField.value = u.extractedValue;
        }
      } else if (u.status === "match") {
        targetField.status = "match";
        targetField.pendingCorrection = null;
        if (u.value !== undefined && u.value !== null && u.value !== "") {
          targetField.value = u.value;
        }
      } else if (u.status === "filled") {
        // Save directly into Editable Session DB for unfilled columns
        targetField.status = "filled";
        targetField.pendingCorrection = null;
        targetField.value = u.value;
      } else if (u.status === "mismatch") {
        targetField.status = "mismatch";
        targetField.pendingCorrection = u.extractedValue || null;
        if (u.extractedValue) {
          targetField.value = u.extractedValue;
        }
      } else {
        targetField.status = u.status || "unsure";
        targetField.pendingCorrection = u.extractedValue || null;
      }

      updatedFields.push({ field: targetField, update: u });
    }

    saveFieldsToSession();
    renderCurrentField();
    renderSummaryTable();

    const first = updatedFields[0];
    if (updatedFields.length > 1) {
      const summaryLabel = updatedFields.map(({ field, update }) => `${field.label?.split("/")[0]?.trim() || field.id}: "${update.value}"`).join(" • ");
      if (vadIndicator) {
        vadIndicator.textContent = `✓ Saved ${updatedFields.length} fields to Session DB: ${summaryLabel}`;
        vadIndicator.className = "vad-indicator idle";
      }
      return;
    }

    if (first?.update?.intent === "correct_instruction") {
      if (vadIndicator) {
        vadIndicator.textContent = first.update.extractedValue
          ? `Instruction suggested "${first.update.extractedValue}" in Session DB. Edit or tap ✔.`
          : `Instruction heard: "${transcript}". Please edit Session DB value below.`;
        vadIndicator.className = "vad-indicator speaking";
      }
      return;
    }

    if (first?.update?.status === "match") {
      if (vadIndicator) {
        vadIndicator.textContent = `✓ Match verified (${first.field.value || "OK"}). Moving to next field...`;
        vadIndicator.className = "vad-indicator idle";
      }
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        if (currentFieldIndex < fields.length - 1) {
          navigateField(1);
          speakCurrentField();
        } else {
          switchScreen("screen-summary");
        }
      }, 650);
      return;
    }

    if (first?.update?.status === "filled") {
      if (vadIndicator) {
        vadIndicator.textContent = `✓ Filled in Session DB: "${first.field.value}". Edit below, tap ✔ or Next.`;
        vadIndicator.className = "vad-indicator idle";
      }
      return;
    }

    if (first?.update?.status === "mismatch") {
      const orig = (first.update.formValue || "").trim();
      if (vadIndicator) {
        vadIndicator.textContent = first.update.extractedValue
          ? `Updated Session DB: "${first.update.extractedValue}" (Form had "${orig}"). Edit or tap ✔.`
          : "Customer reported error (गलत है). Speak value or edit Session DB below.";
        vadIndicator.className = "vad-indicator speaking";
      }
      return;
    }
  }

  // 4. Unclear fallback
  current.heardTranscript = transcript;
  current.transcript = transcript;
  current.intent = extraction.intent || "unclear";
  current.status = "unsure";
  saveFieldsToSession();
  renderCurrentField();
  renderSummaryTable();
  if (vadIndicator) {
    vadIndicator.textContent = extraction.unmatchedReason === "empty_field_needs_value"
      ? "Field is blank — please speak the value or type it in Session DB below."
      : `Heard: "${transcript}". Speak clearly or edit Session DB below.`;
    vadIndicator.className = "vad-indicator idle";
  }
}
function handleFieldDecision(type) {
  const current = fields[currentFieldIndex];
  if (!current) return;

  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }

  if (type === "match") {
    if (current.pendingCorrection) {
      current.value = current.pendingCorrection;
      current.pendingCorrection = null;
    }
    current.status = "match";
    saveFieldsToSession();
    renderCurrentField();

    if (currentFieldIndex < fields.length - 1) {
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        navigateField(1);
        speakCurrentField();
      }, 350);
    } else {
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        switchScreen("screen-summary");
      }, 500);
    }

  } else if (type === "mismatch") {
    current.status = "mismatch";
    saveFieldsToSession();
    renderCurrentField();

    // FIX: Advance to the next field when the operator clicks the Cross button
    if (currentFieldIndex < fields.length - 1) {
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        navigateField(1);
        speakCurrentField();
      }, 350);
    } else {
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        switchScreen("screen-summary");
      }, 500);
    }

  } else if (type === "ask_again") {
    current.status = "not_checked";
    current.pendingCorrection = null;
    current.heardTranscript = null;
    saveFieldsToSession();
    renderCurrentField();
    speakCurrentField();
  }
}

// -------------------------------------------------------------------
// SCREEN 4: VERIFICATION SUMMARY (MINIMALIST OPEN ROWS & APPLY)
// -------------------------------------------------------------------
function updateSummaryCounters() {
  const badgeCount = document.getElementById("summary-badge-count");
  if (badgeCount && fields.length > 0) {
    const verifiedCount = fields.filter((f) => f.status === "match" || f.status === "filled").length;
    const mismatchCount = fields.filter((f) => f.status === "mismatch").length;
    if (mismatchCount > 0) {
      badgeCount.textContent = `(${verifiedCount}/${fields.length} Ready • ${mismatchCount} Flagged)`;
    } else {
      badgeCount.textContent = `(${verifiedCount}/${fields.length} Ready)`;
    }
  }
}

function renderSummaryTable() {
  if (!summaryTableBody) return;
  summaryTableBody.innerHTML = "";
  updateSummaryCounters();

  // Also update legacy list for unit tests
  if (summaryList) summaryList.innerHTML = "";

  fields.forEach((field, idx) => {
    const row = document.createElement("div");
    row.className = "summary-row-item";
    const labelClean = (field.label || field.id).split("/")[0].trim();
    const statusClass = field.status || "not-checked";
    const statusText = formatStatus(field.status);
    const statusIcon = field.status === "match" || field.status === "filled" ? "✔ " : (field.status === "mismatch" ? "✖ " : "○ ");

    const rowLeft = document.createElement("div");
    rowLeft.className = "row-left";
    const rowNum = document.createElement("span");
    rowNum.className = "row-num";
    rowNum.textContent = `${idx + 1}.)`;
    const rowLabel = document.createElement("span");
    rowLabel.className = "row-label";
    rowLabel.title = field.label || field.id;
    rowLabel.textContent = labelClean;
    rowLeft.appendChild(rowNum);
    rowLeft.appendChild(rowLabel);

    const rowValueCol = document.createElement("div");
    rowValueCol.className = "row-value-col";
    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "summary-edit-input";
    editInput.value = field.value || "";
    editInput.placeholder = "Blank (type or speak)";
    editInput.setAttribute("data-field-id", field.id);

    const statusBadgeCol = document.createElement("div");
    statusBadgeCol.className = "row-status-col";
    const chipEl = document.createElement("span");
    chipEl.className = `chip ${statusClass}`;
    chipEl.textContent = `${statusIcon}${statusText}`;
    statusBadgeCol.appendChild(chipEl);

    editInput.addEventListener("click", (e) => e.stopPropagation());
    const onSummaryEdit = (e) => {
      e.stopPropagation();
      applyOperatorSessionEdit(field, e.target.value);
      saveFieldsToSession();
      const sClass = field.status || "not-checked";
      const sText = formatStatus(field.status);
      const sIcon = field.status === "match" || field.status === "filled" ? "✔ " : (field.status === "mismatch" ? "✖ " : "○ ");
      chipEl.className = `chip ${sClass}`;
      chipEl.textContent = `${sIcon}${sText}`;
      updateSummaryCounters();
    };
    editInput.addEventListener("input", onSummaryEdit);
    editInput.addEventListener("change", onSummaryEdit);

    rowValueCol.appendChild(editInput);
    row.appendChild(rowLeft);
    row.appendChild(rowValueCol);
    row.appendChild(statusBadgeCol);

    row.addEventListener("click", () => {
      currentFieldIndex = idx;
      switchScreen("screen-verification");
      renderCurrentField();
    });
    summaryTableBody.appendChild(row);

    // 2. Legacy summary list
    if (summaryList) {
      const li = document.createElement("li");
      li.className = "summary-item";
      const labelSpan = document.createElement("span");
      labelSpan.className = "summary-item-label";
      labelSpan.textContent = `${field.label || field.id}: `;
      const strong = document.createElement("strong");
      strong.textContent = field.value || "—";
      labelSpan.appendChild(strong);
      const chipSpan = document.createElement("span");
      chipSpan.className = `chip ${field.status || "not-checked"}`;
      chipSpan.textContent = formatStatus(field.status);
      li.appendChild(labelSpan);
      li.appendChild(chipSpan);
      summaryList.appendChild(li);
    }
  });
}

function finalizeAppliedFields(updatedCount) {
  if (updatedCount > 0) {
    fields.forEach((f) => {
      if (f.value !== undefined && f.value !== null && String(f.value).trim() !== "") {
        f.formValue = String(f.value);
        if (f.status === "filled" || (f.status === "mismatch" && f.pendingCorrection)) {
          f.status = "match";
          f.decision = "match";
          f.pendingCorrection = null;
        }
      }
    });
    saveFieldsToSession();
    renderSummaryTable();
    if (applyFeedback) {
      applyFeedback.classList.remove("hidden");
      applyFeedback.textContent = `✓ Autofilled ${updatedCount} field(s) on webpage with green highlight!`;
      setTimeout(() => applyFeedback.classList.add("hidden"), 3500);
    }
  } else if (applyFeedback) {
    applyFeedback.classList.remove("hidden");
    applyFeedback.textContent = "⚠️ Could not locate matching inputs on webpage. Refresh page and retry.";
    setTimeout(() => applyFeedback.classList.add("hidden"), 3500);
  }
}

/**
 * Safe In-Page DOM Apply:
 * Updates the webpage input fields with approved/edited Session DB values and pulses with green glow.
 * Invariant: NEVER submits the form!
 */
function handleApplyChangesToForm() {
  const payload = fields.map((f) => ({ id: f.id, value: f.value, status: f.status }));

  if (isInIframe) {
    let settled = false;
    const onApplyResp = (event) => {
      if (event.source !== window.parent) return;
      if (event.data?.type === "JAANCH_APPLY_RESPONSE") {
        settled = true;
        window.removeEventListener("message", onApplyResp);
        finalizeAppliedFields(Number(event.data.count) || 0);
      }
    };
    window.addEventListener("message", onApplyResp);
    try {
      window.parent.postMessage({ type: "JAANCH_APPLY_FIELD_UPDATES", fields: payload }, "*");
    } catch (e) {}
    setTimeout(() => {
      if (!settled) {
        window.removeEventListener("message", onApplyResp);
        finalizeAppliedFields(0);
      }
    }, 1000);
    return;
  }

  if (typeof chrome !== "undefined" && chrome.tabs?.query) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(
          activeTab.id,
          { type: "APPLY_FIELD_UPDATES", fields: payload },
          (response) => {
            if (chrome.runtime.lastError) {
              finalizeAppliedFields(0);
              return;
            }
            finalizeAppliedFields(Number(response?.count) || 0);
          }
        );
      } else {
        finalizeAppliedFields(0);
      }
    });
  } else {
    finalizeAppliedFields(payload.length);
  }
}

// -------------------------------------------------------------------
// PROXY HEALTH CHECK & SESSION WIPING
// -------------------------------------------------------------------
async function checkProxyHealth() {
  const applyOnline = (data) => {
    isProxyReachable = true;
    if (modeBadge) {
      modeBadge.textContent = `${data?.mode || "live"} mode`;
      modeBadge.className = `mode-badge ${data?.mode === "live" ? "live" : "fixture"}`;
    }
    return true;
  };

  const applyOffline = () => {
    isProxyReachable = false;
    if (modeBadge) {
      modeBadge.textContent = "Offline (Sample)";
      modeBadge.className = "mode-badge fixture";
    }
    return false;
  };

  try {
    const res = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      return applyOnline(data);
    }
  } catch (e) {
    // Fallback to service worker relay if iframe direct loopback fetch is blocked
  }

  const relayed = await sendProxyRuntimeMessage({ type: "PROXY_HEALTH", proxyUrl: PROXY_URL });
  if (relayed?.ok) {
    return applyOnline(relayed.data);
  }
  return applyOffline();
}

function saveFieldsToSession() {
  const fieldMap = {};
  fields.forEach((f) => { fieldMap[f.id] = f; });
  lastSavedFieldsSignature = JSON.stringify(fieldMap);

  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.set({ fields: fieldMap, lastActiveAt: Date.now() });
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: "SESSION_FIELDS_UPDATED",
      fields: Object.values(fieldMap),
    }).catch(() => {});
  }
}

function wipeSessionData() {
  isMicPaused = true;
  stopCurrentInteractions({ keepVad: false, forceCancel: true });
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.clear().then(() => {
      fields = [];
      currentFieldIndex = 0;
      lastSavedFieldsSignature = "";
      updateFromStorage({});
      switchScreen("screen-homepage", { force: true });
    });
  } else {
    fields = [];
    currentFieldIndex = 0;
    lastSavedFieldsSignature = "";
    updateFromStorage({});
    switchScreen("screen-homepage", { force: true });
  }
}
