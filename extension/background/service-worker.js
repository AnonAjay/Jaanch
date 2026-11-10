/**
 * Jaanch Background Service Worker (MV3)
 * Stateless message router and 30-minute idle session wiper.
 */

const IDLE_ALARM_NAME = "jaanch_idle_wipe";
const IDLE_TIMEOUT_MINUTES = 30;

// Central in-memory state hub for active tab fields
let activeFieldsMap = {};

// SPA Routing Fix (Dynamic Navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  chrome.tabs.sendMessage(details.tabId, { action: "route_changed" })
  .catch((error) => {
    console.log("[Jaanch] Content script not ready for route change yet:", error);
  });
});

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
      replaceActiveFields(message.fields);
    }

    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "FIELDS_DISCOVERED") {
    replaceActiveFields(message.fields);
    sendResponse({ ok: true, count: Object.keys(activeFieldsMap).length });
    return false;
  }

  if (message.type === "FIELD_CHANGED") {
    const { id, value } = message;
    if (activeFieldsMap[id]) {
      activeFieldsMap[id].value = value;
      activeFieldsMap[id].status = "not_checked";
    }
    if (chrome.storage?.session) {
      chrome.storage.session.get(["fields"], (res) => {
        const fields = res?.fields || {};
        if (fields[id]) {
          fields[id].value = value;
          fields[id].status = "not_checked";
          chrome.storage.session.set({ fields, lastActiveAt: Date.now() });
        }
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "SESSION_CLEARED") {
    activeFieldsMap = {};
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

  sendResponse({ ok: true });
  return false;
});

function resetIdleTimer() {
  chrome.alarms.clear(IDLE_ALARM_NAME, () => {
    chrome.alarms.create(IDLE_ALARM_NAME, { delayInMinutes: IDLE_TIMEOUT_MINUTES });
  });
}

function replaceActiveFields(input) {
  const list = Array.isArray(input) ? input : Object.values(input || {});
  activeFieldsMap = Object.fromEntries(list.filter((field) => field?.id).map((field) => [field.id, field]));
  if (chrome.storage?.session) {
    chrome.storage.session.set({ fields: activeFieldsMap, lastActiveAt: Date.now() });
  }
}

// 30-minute idle session wiper
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === IDLE_ALARM_NAME) {
    if (chrome.storage?.session) {
      chrome.storage.session.clear().then(() => {
        console.log("[Jaanch] Session storage wiped due to 30 min idle timeout.");
        chrome.runtime.sendMessage({ type: "SESSION_CLEARED", reason: "idle" }).catch(() => {});
      });
    }
  }
});
