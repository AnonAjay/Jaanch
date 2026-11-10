# Extension Notes

The MV3 extension discovers live form fields and stores runtime values in `chrome.storage.session`. The toolbar icon and page sticker both toggle the same popup frame for operator-led verification.

```text
Live page → content script → service worker → session storage
                 └─ live bridge → popup
Toolbar action ─────────────────→ popup
Popup → on-device readback; reply WAV → proxy /stt → deterministic checks
```

- The content script keeps portal DOM access and submit-button integration isolated from popup UI.
- The worker owns session writes and idle cleanup.
- Readback uses on-device speech synthesis. Reply speech is sent to `/stt` for transcription.
- The operator decides whether to accept, keep, or ask again. The extension never submits a form.
- Permissions: `storage`, `alarms`; host access includes `<all_urls>` for universal live-portal support.
