/**
 * Jaanch (जाँच) - Full-Page Browser Settings Controller (extension/settings/settings.js)
 * Implements 2-column sidebar submenus (Wispr Flow style) & live preference controls.
 */

import { playTTSPhrase } from "../lib/audio-player.js";
import { detectFormLanguage, getLanguageDisplayLabel } from "../lib/extractor.js";

// DOM Elements
const micStatusChip = document.getElementById("mic-status-chip");
const btnRequestMic = document.getElementById("btn-request-mic");
const btnTestMic = document.getElementById("btn-test-mic");
const micMeterContainer = document.getElementById("mic-meter-container");
const micMeterBar = document.getElementById("mic-meter-bar");
const meterLevelVal = document.getElementById("meter-level-val");
const micFeedbackMsg = document.getElementById("mic-feedback-msg");

const detectedLangPill = document.getElementById("detected-lang-pill");
const selectLanguage = document.getElementById("select-language");
const selectVoice = document.getElementById("select-voice");
const btnPreviewVoice = document.getElementById("btn-preview-voice");

const btnWipeSession = document.getElementById("btn-wipe-session");
const wipeFeedback = document.getElementById("wipe-feedback");
const sidebarProxyDot = document.getElementById("sidebar-proxy-dot");
const sidebarProxyStatus = document.getElementById("sidebar-proxy-status");
const aboutProxyDesc = document.getElementById("about-proxy-desc");
const aboutProxyStatus = document.getElementById("about-proxy-status");

const PROXY_URL = "http://127.0.0.1:8000";

let audioTestContext = null;
let audioTestStream = null;
let audioTestAnimId = null;
let isMicTesting = false;

document.addEventListener("DOMContentLoaded", () => {
  setupSidebarNavigation();
  loadSettings();
  checkMicPermissionState();
  refreshProxyStatus();

  // Event Listeners
  btnRequestMic?.addEventListener("click", requestMicrophoneAccess);
  btnTestMic?.addEventListener("click", toggleLiveMicTest);

  selectLanguage?.addEventListener("change", (e) => {
    saveSetting("selectedLanguage", e.target.value);
  });

  selectVoice?.addEventListener("change", (e) => {
    saveSetting("selectedVoice", e.target.value);
  });

  btnPreviewVoice?.addEventListener("click", previewVoicePrompt);
  btnWipeSession?.addEventListener("click", wipeAllSessionData);
});

/**
 * Sidebar Submenu Switching (Wispr Flow style)
 */
function setupSidebarNavigation() {
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      navItems.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabPanes.forEach((pane) => {
        if (pane.id === targetId) {
          pane.classList.remove("hidden");
          pane.classList.add("active");
        } else {
          pane.classList.add("hidden");
          pane.classList.remove("active");
        }
      });
    });
  });
}

async function loadSettings() {
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.get(
      ["micPermission", "selectedLanguage", "selectedVoice", "fields", "detectedFormLanguage"],
      (res) => {
        if (res.selectedLanguage && selectLanguage) {
          selectLanguage.value = res.selectedLanguage;
        }
        if (res.selectedVoice && selectVoice) {
          selectVoice.value = res.selectedVoice;
        }

        // Show detected form language consistently with popup STT/autofill detection
        if (detectedLangPill) {
          const detectedCode =
            res.detectedFormLanguage ||
            (res.fields ? detectFormLanguage(Object.values(res.fields)) : "en-IN");
          detectedLangPill.textContent = getLanguageDisplayLabel(detectedCode);
        }
      }
    );
  }
}

async function checkMicPermissionState() {
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" });
      updateMicChip(status.state);
      status.onchange = () => updateMicChip(status.state);
      return;
    } catch (e) {}
  }

  // Fallback to storage
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.get(["micPermission"], (res) => {
      updateMicChip(res.micPermission || "prompt");
    });
  } else {
    updateMicChip("prompt");
  }
}

function updateMicChip(state) {
  if (!micStatusChip) return;

  if (state === "granted") {
    micStatusChip.className = "status-pill status-mint";
    micStatusChip.textContent = "Granted (अनुमति प्राप्त)";
    if (btnRequestMic) {
      btnRequestMic.textContent = "✓ Permission Granted";
      btnRequestMic.disabled = true;
      btnRequestMic.style.opacity = "0.7";
      btnRequestMic.style.cursor = "default";
    }
  } else if (state === "denied") {
    micStatusChip.className = "status-pill status-soft";
    micStatusChip.textContent = "Blocked (अस्वीकृत)";
    if (btnRequestMic) {
      btnRequestMic.textContent = "Re-request Microphone";
      btnRequestMic.disabled = false;
      btnRequestMic.style.opacity = "1";
    }
  } else {
    micStatusChip.className = "status-pill status-soft";
    micStatusChip.textContent = "Prompt (अनुमति आवश्यक)";
    if (btnRequestMic) {
      btnRequestMic.textContent = "Allow Microphone Access";
      btnRequestMic.disabled = false;
      btnRequestMic.style.opacity = "1";
    }
  }
}

async function requestMicrophoneAccess() {
  hideFeedback(micFeedbackMsg);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    updateMicChip("granted");
    saveSetting("micPermission", "granted");
    showFeedback(micFeedbackMsg, "✓ Microphone access granted! Jaanch voice verification is now active.", "success");
  } catch (err) {
    console.error("Microphone access error:", err);
    updateMicChip("denied");
    saveSetting("micPermission", "denied");
    showFeedback(
      micFeedbackMsg,
      "Microphone access was denied. Please allow microphone access in your browser site settings.",
      "error"
    );
  }
}

async function refreshProxyStatus() {
  try {
    const [healthResp, budgetResp] = await Promise.all([
      fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${PROXY_URL}/budget`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
    ]);

    if (healthResp.ok) {
      const health = await healthResp.json();
      const budget = budgetResp?.ok ? await budgetResp.json() : null;
      const modeLabel = health.mode || (health.has_key ? "live" : "fixture");
      if (sidebarProxyDot) sidebarProxyDot.style.backgroundColor = "#2FBF9B";
      if (sidebarProxyStatus) sidebarProxyStatus.textContent = `Gnani Speech Proxy: ${modeLabel}`;
      if (aboutProxyStatus) {
        aboutProxyStatus.textContent = `Online (${modeLabel})`;
        aboutProxyStatus.className = "status-pill status-mint";
      }
      if (aboutProxyDesc && budget) {
        aboutProxyDesc.textContent = `FastAPI proxy at ${PROXY_URL} • Budget used: ${budget.used ?? 0}/${budget.cap ?? "—"} (Remaining: ${budget.remaining ?? "—"})`;
      }
    } else {
      throw new Error(`HTTP ${healthResp.status}`);
    }
  } catch (err) {
    if (sidebarProxyDot) sidebarProxyDot.style.backgroundColor = "#FF7E6B";
    if (sidebarProxyStatus) sidebarProxyStatus.textContent = "Gnani Speech Proxy: Offline";
    if (aboutProxyStatus) {
      aboutProxyStatus.textContent = "Offline";
      aboutProxyStatus.className = "status-pill status-coral";
    }
  }
}

function toggleLiveMicTest() {
  if (isMicTesting) {
    stopLiveMicTest();
  } else {
    runLiveMicTest();
  }
}

async function runLiveMicTest() {
  hideFeedback(micFeedbackMsg);
  stopLiveMicTest();

  try {
    audioTestStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });

    audioTestContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioTestContext.state === "suspended") {
      await audioTestContext.resume();
    }
    const source = audioTestContext.createMediaStreamSource(audioTestStream);
    const analyser = audioTestContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    micMeterContainer?.classList.remove("hidden");
    const dataArray = new Uint8Array(analyser.fftSize);
    isMicTesting = true;

    function updateMeter() {
      if (!isMicTesting) return;
      analyser.getByteTimeDomainData(dataArray);
      let sumSq = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const centered = (dataArray[i] - 128) / 128;
        sumSq += centered * centered;
      }
      const rms = Math.sqrt(sumSq / dataArray.length);
      const pct = Math.min(100, Math.round(rms * 350));

      if (micMeterBar) micMeterBar.style.width = `${pct}%`;
      if (meterLevelVal) meterLevelVal.textContent = `${pct}%`;

      audioTestAnimId = requestAnimationFrame(updateMeter);
    }
    updateMeter();

    if (btnTestMic) {
      btnTestMic.textContent = "Stop Test (रोकें)";
    }

    showFeedback(micFeedbackMsg, "Speak into your microphone now to test live audio input.", "info");
  } catch (err) {
    isMicTesting = false;
    console.error("Mic test error:", err);
    showFeedback(micFeedbackMsg, "Could not access microphone for live test: " + err.message, "error");
  }
}

function stopLiveMicTest() {
  isMicTesting = false;
  if (audioTestAnimId) {
    cancelAnimationFrame(audioTestAnimId);
    audioTestAnimId = null;
  }
  if (audioTestStream) {
    audioTestStream.getTracks().forEach((t) => t.stop());
    audioTestStream = null;
  }
  if (audioTestContext) {
    audioTestContext.close().catch(() => {});
    audioTestContext = null;
  }
  if (micMeterBar) micMeterBar.style.width = "0%";
  if (meterLevelVal) meterLevelVal.textContent = "0%";
  if (btnTestMic) {
    btnTestMic.textContent = "Test Microphone";
  }
}

async function previewVoicePrompt() {
  const persona = selectVoice?.value || "shivani";
  const phrase = persona === "avinash"
    ? "नमस्कार, मैं अविनाश हूँ। जाँच में आपका स्वागत है।"
    : "नमस्कार, मैं शिवानी हूँ। कृपया फ़ॉर्म विवरण की जाँच करें।";

  try {
    if (btnPreviewVoice) {
      btnPreviewVoice.textContent = "🔊 Playing...";
      btnPreviewVoice.disabled = true;
    }
    await playTTSPhrase(phrase, { voice: persona });
  } catch (err) {
    console.warn("[Jaanch Settings] Voice preview error:", err);
  } finally {
    if (btnPreviewVoice) {
      btnPreviewVoice.textContent = "🔊 Preview Voice";
      btnPreviewVoice.disabled = false;
    }
  }
}

function wipeAllSessionData() {
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "SESSION_CLEARED", reason: "manual_settings_wipe" }, () => {
      showFeedback(wipeFeedback, "✓ All session data, field values, and cached audio wiped successfully.", "success");
      setTimeout(() => hideFeedback(wipeFeedback), 3000);
    });
  } else if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.clear().then(() => {
      showFeedback(wipeFeedback, "✓ Ephemeral session memory cleared.", "success");
      setTimeout(() => hideFeedback(wipeFeedback), 3000);
    });
  } else {
    showFeedback(wipeFeedback, "✓ Mock session reset.", "success");
  }
}

function saveSetting(key, val) {
  if (typeof chrome !== "undefined" && chrome.storage?.session) {
    chrome.storage.session.set({ [key]: val });
  }
}

function showFeedback(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = `feedback-toast ${type || "info"}`;
  el.classList.remove("hidden");
}

function hideFeedback(el) {
  if (!el) return;
  el.classList.add("hidden");
}
