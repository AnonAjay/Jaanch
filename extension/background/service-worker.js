/**
 * Jaanch Background Service Worker (MV3)
 * Stateless message router and 30-minute idle session wiper.
 */

const IDLE_ALARM_NAME = "jaanch_idle_wipe";
const IDLE_TIMEOUT_MINUTES = 30;
const DEFAULT_PROXY_URL = "http://127.0.0.1:8000";

// Central in-memory state hub for active tab fields
let activeFieldsMap = {};
let activePageUrl = "";

// Enable content scripts to read and write chrome.storage.session directly (MV3)
function configureSessionAccess() {
  if (typeof chrome !== "undefined" && chrome.storage?.session?.setAccessLevel) {
    chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
    }).catch((err) => {
      console.warn("[Jaanch] setAccessLevel notice:", err);
    });
  }
}
configureSessionAccess();

chrome.runtime.onInstalled.addListener(() => {
  console.log("Jaanch extension installed.");
  configureSessionAccess();
  resetIdleTimer();
});

// The toolbar icon and in-page sticker both open the same embedded popup.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_TOP_DROPDOWN" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[Jaanch] Could not reach the active page content script.");
    }
  });
});

// Message routing
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  resetIdleTimer();

  if (message.type === "RECHECK_CLICKED") {
    if (message.fields) {
      replaceActiveFields(message.fields, { url: message.url });
    }

    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "FIELDS_DISCOVERED") {
    replaceActiveFields(message.fields, { url: message.url, reset: message.reset });
    sendResponse({ ok: true, count: Object.keys(activeFieldsMap).length });
    return false;
  }

  if (message.type === "SESSION_FIELDS_UPDATED") {
    const incoming = Array.isArray(message.fields) ? message.fields : Object.values(message.fields || {});
    activeFieldsMap = Object.fromEntries(incoming.filter((field) => field?.id).map((field) => [field.id, field]));
    if (message.url) activePageUrl = message.url;
    if (chrome.storage?.session) {
      chrome.storage.session.set({ fields: activeFieldsMap, lastActiveAt: Date.now() });
    }
    sendResponse({ ok: true, count: Object.keys(activeFieldsMap).length });
    return false;
  }

  if (message.type === "FIELD_CHANGED") {
    const { id, value } = message;
    const applyLocalEdit = (targetMap) => {
      if (targetMap[id]) {
        targetMap[id].formValue = value;
        targetMap[id].value = value;
        targetMap[id].status = "not_checked";
        targetMap[id].decision = null;
        targetMap[id].extractedValue = null;
        targetMap[id].pendingCorrection = null;
        targetMap[id].transcript = "";
        targetMap[id].heardTranscript = "";
        targetMap[id].intent = null;
        targetMap[id].instruction = null;
        targetMap[id].editedByUser = false;
        targetMap[id].updatedAt = Date.now();
      }
    };
    applyLocalEdit(activeFieldsMap);
    if (chrome.storage?.session) {
      chrome.storage.session.get(["fields"], (res) => {
        const fields = res?.fields || activeFieldsMap || {};
        applyLocalEdit(fields);
        activeFieldsMap = fields;
        chrome.storage.session.set({ fields, lastActiveAt: Date.now() });
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "SESSION_CLEARED") {
    activeFieldsMap = {};
    activePageUrl = "";
    if (chrome.storage?.session) {
      chrome.storage.session.clear().then(() => {
        console.log(`[Jaanch] Session storage cleared: reason=${message.reason}`);
        sendResponse({ ok: true });
      });
      return true;
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "PROXY_HEALTH") {
    relayProxyHealth(message.proxyUrl)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, networkError: true, error: err?.message || "Network error" }));
    return true;
  }

  if (message.type === "PROXY_STT") {
    relayProxyStt(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, networkError: true, error: err?.message || "Network error" }));
    return true;
  }

  sendResponse({ ok: true });
  return false;
});

function resetIdleTimer() {
  chrome.alarms.clear(IDLE_ALARM_NAME, () => {
    chrome.alarms.create(IDLE_ALARM_NAME, { delayInMinutes: IDLE_TIMEOUT_MINUTES });
  });
}

function replaceActiveFields(input, options = {}) {
  const list = Array.isArray(input) ? input : Object.values(input || {});
  const routeChanged = Boolean(options.url && activePageUrl && options.url !== activePageUrl);
  if (routeChanged || options.reset) {
    activeFieldsMap = {};
  }
  if (options.url) {
    activePageUrl = options.url;
  }

  const mergedList = list
    .filter((field) => field?.id)
    .map((incoming) => {
      const prev = !routeChanged && !options.reset ? activeFieldsMap[incoming.id] : null;
      if (!prev) return incoming;

      const prevFormVal = prev.formValue !== undefined ? prev.formValue : (prev.value || "");
      const nextFormVal = incoming.formValue !== undefined ? incoming.formValue : (incoming.value || "");
      const hasSessionState =
        prev.editedByUser ||
        (prev.status && prev.status !== "not_checked") ||
        Boolean(prev.extractedValue) ||
        Boolean(prev.pendingCorrection) ||
        Boolean(prev.heardTranscript);

      if (hasSessionState && prevFormVal === nextFormVal) {
        return {
          ...incoming,
          ...prev,
          label: incoming.label || prev.label,
          required: incoming.required ?? prev.required,
          kind: incoming.kind || prev.kind,
          formValue: nextFormVal,
        };
      }
      return incoming;
    });

  activeFieldsMap = Object.fromEntries(mergedList.map((field) => [field.id, field]));
  if (chrome.storage?.session) {
    chrome.storage.session.set({ fields: activeFieldsMap, lastActiveAt: Date.now() });
  }
}

// 30-minute idle session wiper
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === IDLE_ALARM_NAME) {
    activeFieldsMap = {};
    activePageUrl = "";
    if (chrome.storage?.session) {
      chrome.storage.session.clear().then(() => {
        console.log("[Jaanch] Session storage wiped due to 30 min idle timeout.");
        chrome.runtime.sendMessage({ type: "SESSION_CLEARED", reason: "idle" }).catch(() => {});
      });
    }
  }
});

function resolveSafeProxyUrl(candidate) {
  try {
    const url = new URL(candidate || DEFAULT_PROXY_URL);
    if ((url.protocol === "http:" || url.protocol === "https:") && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) {
      return url.origin;
    }
  } catch (e) {}
  return DEFAULT_PROXY_URL;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function relayProxyHealth(proxyUrl) {
  const baseUrl = resolveSafeProxyUrl(proxyUrl);
  const res = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.timeout(3000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

async function relayProxyStt(message) {
  const baseUrl = resolveSafeProxyUrl(message.proxyUrl);
  const wavBytes = base64ToUint8Array(message.wavBase64);
  const wavBlob = new Blob([wavBytes], { type: "audio/wav" });

  const formData = new FormData();
  formData.append("audio_file", wavBlob, "reply.wav");
  formData.append("language_code", message.languageCode || "hi-IN");

  const headers = {};
  if (message.sessionId) {
    headers["X-Session-ID"] = message.sessionId;
  }

  const res = await fetch(`${baseUrl}/stt`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(12000),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {}

  return {
    ok: res.ok,
    status: res.status,
    data,
    detail: data?.detail || (res.ok ? "" : `HTTP ${res.status}`),
  };
}
