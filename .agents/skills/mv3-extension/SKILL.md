---
name: mv3-extension
description: Use when building or debugging the Chrome Manifest V3 extension: manifest, content script, service worker, side panel, messaging, session storage, mic permission, injected Recheck button.
---
# Chrome MV3 extension skill

Browser behaviour varies by Chrome version. Verify each claim below with a spike before relying on it.

## Manifest sketch
- `manifest_version: 3`, `name`, `version`, `description`.
- `permissions`: `storage`, `sidePanel`, `alarms`. Nothing else unless a spike proves it is needed.
- `host_permissions`: the mock portal origin and the proxy origin only. Never `<all_urls>`.
- `content_scripts`: `matches` the mock portal origin only.
- `background.service_worker`, `side_panel.default_path`. No remote code, no inline scripts.

## Content script
- Discover fields: inputs, selects, textareas. Label from `label[for]`, `aria-label`, placeholder, or nearest preceding text. Required if `required`, `aria-required`, or an asterisk in the label.
- Infer `kind` from type/name/label keywords (English and Hindi: "date of birth", "dob", "जन्म तिथि", "district", "जिला", "name", "नाम").
- Capture values on `focusout`/`change`. Use a `MutationObserver` for fields added later.
- Inject the Recheck button next to the submit button inside a Shadow DOM so site CSS cannot break it. Never `preventDefault` on the site's own submit.

## Service worker
- It is temporary. Keep no state in variables. Use `chrome.storage.session`.
- It cannot play audio, use the mic, or touch the DOM.
- Use `chrome.alarms` for the 30-minute idle wipe.
- Opening the side panel needs a user gesture: content click -> message -> `chrome.sidePanel.open({tabId})`. If this fails in a spike, use the in-page overlay fallback.

## Side panel (extension page)
- Owns audio playback, mic capture, the loudness check, and the logic from `extension/lib/`.
- Mic: call `getUserMedia` here. If no prompt appears, request permission once from `extension/setup/permissions.html` opened in a normal tab.
- Audio playback starts only after a user gesture.

## Testing
Load unpacked, reload after every change, read service-worker logs, test on the mock portal, unit-test `lib/` with `node --test`.

## Checklist before saying done
Permissions minimal; no keys in code; no network call carries a field value; state wiped on submit/close/idle; Recheck button does not block submit.
