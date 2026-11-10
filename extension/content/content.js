/**
 * Jaanch Universal Content Script (extension/content/content.js)
 * Operates on actual live portals (Microsoft Forms, Google Forms, NIC/SSC government portals, university/state portals).
 * Combines submit button and Jaanch arrow trigger under one parent wrapper with zero gap.
 * Arrow button is half-width (24px) collapsed, expanding on hover to a dark green pill ("Recheck with जाँच").
 */

(function () {
  if (typeof window !== "undefined") {
    if (window.__jaanchContentInitialized) return;
    window.__jaanchContentInitialized = true;
  }

  function clearJaanchOverlays() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("#jaanch-dropdown-root, #jaanch-floating-modal-root")
      .forEach((overlay) => overlay.remove());
  }

  /**
   * Determine if an input element should be ignored (e.g. search, captcha, CSRF token, password).
   */
  function isIgnoredField(input) {
    const type = (input.type || "").toLowerCase();
    if (["hidden", "submit", "button", "reset", "password", "file", "image"].includes(type)) {
      return true;
    }

    const identifier = `${input.id || ""} ${input.name || ""} ${input.className || ""} ${input.placeholder || ""}`.toLowerCase();
    if (
      identifier.includes("captcha") ||
      identifier.includes("csrf") ||
      identifier.includes("xsrf") ||
      identifier.includes("authenticity_token") ||
      identifier.includes("nonce") ||
      identifier.includes("search") ||
      identifier.includes("search-input") ||
      identifier.includes("g-recaptcha") ||
      identifier.includes("h-captcha") ||
      identifier.includes("cf-turnstile")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Infer field kind (date, district, digits, name, text) from name, id, and label text.
   */
  function inferKind(nameOrId, labelText, inputEl) {
    const combined = `${nameOrId || ""} ${labelText || ""}`.toLowerCase();
    const type = (inputEl?.type || "").toLowerCase();

    // HTML5 native types
    if (type === "date") return "date";
    if (type === "number") return "digits";

    // Date keywords (English & Hindi)
    if (
      combined.includes("dob") ||
      combined.includes("birth") ||
      combined.includes("जन्म") ||
      combined.includes("दिनांक") ||
      combined.includes("तारीख") ||
      combined.includes("dd/mm/yyyy") ||
      combined.includes("dd-mm-yyyy")
    ) {
      return "date";
    }

    // District keywords (English & Hindi)
    if (
      combined.includes("district") ||
      combined.includes("जिला") ||
      combined.includes("jila") ||
      combined.includes("zila") ||
      combined.includes("mandal") ||
      combined.includes("tehsil") ||
      combined.includes("तहसील")
    ) {
      return "district";
    }

    // Reference / Roll / Aadhaar / Digits keywords
    if (
      combined.includes("ref") ||
      combined.includes("roll") ||
      combined.includes("reg") ||
      combined.includes("number") ||
      combined.includes("संख्या") ||
      combined.includes("क्रमांक") ||
      combined.includes("slip") ||
      combined.includes("token") ||
      combined.includes("aadhaar") ||
      combined.includes("uid") ||
      combined.includes("voter") ||
      combined.includes("pin") ||
      combined.includes("code") ||
      combined.includes("पंजीकरण") ||
      combined.includes("पर्ची") ||
      combined.includes("खाता") ||
      combined.includes("mobile") ||
      combined.includes("phone")
    ) {
      return "digits";
    }

    // Name keywords
    if (
      combined.includes("name") ||
      combined.includes("नाम") ||
      combined.includes("nam") ||
      combined.includes("candidate") ||
      combined.includes("applicant") ||
      combined.includes("अभ्यर्थी") ||
      combined.includes("आवेदक") ||
      combined.includes("father") ||
      combined.includes("mother")
    ) {
      return "name";
    }

    return "text";
  }

  /**
   * Universal label discovery for live forms:
   * 1. label[for="id"]
   * 2. Closest ancestor <label>
   * 3. aria-labelledby target text
   * 4. aria-label attribute
   * 5. Table cell structure (preceding <td> or <th> in the row)
   * 6. Question card: [role="listitem"] / .question-card heading (.M7eMe, [role="heading"])
   * 7. Container .form-group / .field-group label
   * 8. placeholder (non-generic)
   * 9. Fallback to name or id
   */
  function extractLabel(input, index) {
    let labelText = "";

    // 1. Explicit <label for="id">
    if (input.id) {
      const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(input.id) : input.id;
      const explicitLabel = document.querySelector(`label[for="${escapedId}"]`);
      if (explicitLabel) {
        labelText = explicitLabel.innerText || explicitLabel.textContent || "";
      }
    }

    // 2. Wrapped <label><input ...></label>
    if (!labelText) {
      const parentLabel = input.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        const nestedInput = clone.querySelector("input, select, textarea");
        if (nestedInput) nestedInput.remove();
        labelText = clone.innerText || clone.textContent || "";
      }
    }

    // 3. aria-labelledby (handles single or multiple space-separated IDs, e.g. Google Forms "i1 i4")
    if (!labelText && input.getAttribute("aria-labelledby")) {
      const labelledBy = (input.getAttribute("aria-labelledby") || "").trim();
      const ids = labelledBy.split(/\s+/).filter(Boolean);
      const textParts = [];
      for (const refId of ids) {
        const target = document.getElementById(refId);
        if (target) {
          const txt = (target.innerText || target.textContent || "").trim();
          if (txt && txt !== "*") textParts.push(txt);
        }
      }
      if (textParts.length > 0) {
        labelText = textParts.join(" ");
      }
    }

    // 4. aria-label
    if (!labelText && input.getAttribute("aria-label")) {
      labelText = input.getAttribute("aria-label");
    }

    // 5. Table cell structure (Common on NIC / SSC / Govt portals)
    if (!labelText && input.closest("td")) {
      const currentTd = input.closest("td");
      let prevCell = currentTd.previousElementSibling;
      while (prevCell && prevCell.tagName !== "TD" && prevCell.tagName !== "TH") {
        prevCell = prevCell.previousElementSibling;
      }
      if (prevCell) {
        labelText = prevCell.innerText || prevCell.textContent || "";
      } else {
        const row = input.closest("tr");
        if (row) {
          const firstCell = row.querySelector("td.col-label, th, td:first-child");
          if (firstCell && firstCell !== currentTd) {
            labelText = firstCell.innerText || firstCell.textContent || "";
          }
        }
      }
    }

    // 6. Question card: div[role="listitem"] or .question-card (Google Forms, MS Forms)
    if (!labelText) {
      const card = input.closest('[role="listitem"], .question-card, .geS5n, .Qr7Oae, [data-automation-id="questionItem"]');
      if (card) {
        const titleEl = card.querySelector(
          '[role="heading"], .M7eMe, .F9N2ud, .question-title, [data-automation-id="questionTitle"]'
        );
        if (titleEl) {
          labelText = titleEl.innerText || titleEl.textContent || "";
        }
      }
    }

    // 7. General form container: .form-group, .form-row, .field-group, .pure-control-group, fieldset
    if (!labelText) {
      const container = input.closest(".form-group, .form-row, .field-group, .pure-control-group, fieldset");
      if (container) {
        const header = container.querySelector("label, legend, .form-label, .control-label");
        if (header) {
          labelText = header.innerText || header.textContent || "";
        }
      }
    }

    // 8. placeholder attribute (ignoring generic placeholders)
    if (!labelText && input.placeholder) {
      const ph = input.placeholder.trim();
      const genericPlaceholders = ["your answer", "enter text", "type here", "search", "enter value"];
      if (!genericPlaceholders.includes(ph.toLowerCase())) {
        labelText = ph;
      }
    }

    // 9. Fallback to name or id or synthetic
    if (!labelText) {
      labelText = input.name || input.id || `Field_${index + 1}`;
    }

    // Clean up label text
    return labelText
      .replace(/\*/g, "")
      .replace(/^[0-9]+[\.\)]\s*/, "")
      .replace(/:\s*$/, "")
      .trim();
  }

  /**
   * Discovers all fillable citizen fields on the live page.
   */
  function discoverFields() {
    const rawInputs = Array.from(document.querySelectorAll("input, select, textarea, [role='textbox']"));
    const eligibleInputs = rawInputs.filter((input) => {
      if (input.closest && (input.closest("#jaanch-dropdown-root") || input.closest("#jaanch-recheck-root"))) {
        return false;
      }
      return !isIgnoredField(input);
    });
    const fields = {};

    eligibleInputs.forEach((input, index) => {
      const existingId = input.getAttribute("data-jaanch-id");
      const id = input.id || input.name || existingId || `jaanch-field-${index}`;
      if (!input.id && !input.name && !existingId) {
        input.setAttribute("data-jaanch-id", id);
      }

      const labelText = extractLabel(input, index);
      const isRequired =
        input.required ||
        input.getAttribute("aria-required") === "true" ||
        (input.closest('[role="listitem"], .question-card, tr, .form-group')?.innerText || "").includes("*");

      const kind = inferKind(id, labelText, input);
      const val = input.value !== undefined && input.value !== null && input.value !== ""
        ? input.value
        : (input.innerText || input.textContent || input.getAttribute("data-initial-value") || "");

      fields[id] = globalThis.JaanchFieldModel.create({
        id,
        label: labelText,
        required: isRequired,
        kind,
        value: val,
      });

      // Real-time keystroke and change sync
      input.removeEventListener("change", onInputChange);
      input.removeEventListener("focusout", onInputChange);
      input.removeEventListener("input", onInputChange);

      input.addEventListener("change", onInputChange);
      input.addEventListener("focusout", onInputChange);
      input.addEventListener("input", onInputChange);
    });

    // Keep the direct frame bridge for the embedded dropdown UI.
    if (typeof document !== "undefined") {
      const dropdownIframe = document.querySelector("#jaanch-dropdown-card iframe");
      if (dropdownIframe?.contentWindow) {
        try {
          dropdownIframe.contentWindow.postMessage({
            type: "JAANCH_FIELDS_RESPONSE",
            fields
          }, "*");
        } catch (err) {}
      }
    }

    // The service worker is the single persistence path for extension state.
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          type: "FIELDS_DISCOVERED",
          fields: Object.values(fields),
        })
        .catch(() => {});
    }

    return fields;
  }

  function onInputChange(e) {
    const target = e.target;
    if (!target) return;
    if (target.closest && (target.closest("#jaanch-dropdown-root") || target.closest("#jaanch-recheck-root"))) {
      return;
    }
    const id = target.id || target.name || target.getAttribute("data-jaanch-id");
    if (!id) return;
    const value = target.value !== undefined && target.value !== null
      ? target.value
      : (target.innerText || target.textContent || "");

    // 1. Direct postMessage to in-page dropdown iframe (if open)
    if (typeof document !== "undefined") {
      const dropdownIframe = document.querySelector("#jaanch-dropdown-card iframe");
      if (dropdownIframe?.contentWindow) {
        try {
          dropdownIframe.contentWindow.postMessage({
            type: "FIELD_CHANGED",
            id,
            value,
            ts: Date.now()
          }, "*");
        } catch (err) {}
      }
    }

    // The service worker persists the change to session storage.
    // 3. Runtime message for service worker and toolbar popup
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          type: "FIELD_CHANGED",
          id,
          value,
          ts: Date.now(),
        })
        .catch(() => {});
    }
  }

  /**
   * Locates the primary submit button on the page across MS Forms, Google Forms, Gov portals, etc.
   */
  function findSubmitButton() {
    // 1. Explicit placeholder (if configured)
    const explicitHost = document.getElementById("jaanch-recheck-host");
    if (explicitHost) return explicitHost;

    // 2. Microsoft Forms submit button
    const msFormsBtn = document.querySelector(
      'button[data-automation-id="submitButton"], button[aria-label*="Submit" i], .form-submit-container button'
    );
    if (msFormsBtn) return msFormsBtn;

    // 3. Google Forms submit button: role="button" with submit text or id
    const gfBtn =
      document.getElementById("gf-btn-submit") ||
      document.querySelector('.gf-submit-btn, [role="button"][jsaction*="submit"]') ||
      Array.from(document.querySelectorAll('div[role="button"]')).find((b) => {
        const t = (b.innerText || "").trim().toLowerCase();
        return t === "submit" || t === "सबमिट" || t === "send";
      });
    if (gfBtn) return gfBtn;

    // 4. Standard submit button
    const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) return submitBtn;

    // 5. Any button/input with "submit" / "जमा करें" text
    const allButtons = Array.from(document.querySelectorAll("button, [role='button'], input[type='button']"));
    const candidate = allButtons.find((btn) => {
      const text = (btn.innerText || btn.value || btn.getAttribute("aria-label") || "").trim().toLowerCase();
      return (
        text === "submit" ||
        text.includes("submit") ||
        text.includes("सबमिट") ||
        text.includes("जमा करें") ||
        text.includes("proceed") ||
        text.includes("final submit")
      );
    });
    if (candidate) return candidate;

    // 6. Form actions bar
    const actionsBar = document.querySelector(
      ".actions-bar, .actions-section, .button-row, .form-actions, .submit-container, form footer"
    );
    if (actionsBar) return actionsBar;

    return null;
  }

  function toggleTopFloatingDropdown() {
    if (typeof document === "undefined" || !document.body) return;

    const existing = document.getElementById("jaanch-dropdown-root");
    if (existing) {
      clearJaanchOverlays();
      return;
    }
    // Remove a stale window left by older extension builds before opening one.
    clearJaanchOverlays();

    const root = document.createElement("div");
    root.id = "jaanch-dropdown-root";

    const backdrop = document.createElement("div");
    backdrop.id = "jaanch-dropdown-backdrop";
    backdrop.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483646 !important;
      background: rgba(0, 0, 0, 0.05) !important;
      pointer-events: auto !important;
    `;
    backdrop.addEventListener("click", () => root.remove());

    const container = document.createElement("div");
    container.id = "jaanch-dropdown-card";
    container.style.cssText = `
      position: fixed !important;
      top: 10px !important;
      right: 20px !important;
      width: 612px !important;
      height: 415px !important;
      z-index: 2147483647 !important;
      box-shadow: 0 16px 48px rgba(31, 59, 58, 0.45) !important;
      border: 2px solid #1F3B3A !important;
      border-radius: 0 !important;
      overflow: hidden !important;
      background: #FFF3E6 !important;
    `;

    const liveFields = discoverFields();

    const iframe = document.createElement("iframe");
    const popupUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL 
      ? chrome.runtime.getURL("popup/popup.html")
      : "../popup/popup.html";
    iframe.src = popupUrl;
    iframe.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      border: none !important;
      display: block !important;
      background: #FFF3E6 !important;
    `;

    iframe.addEventListener("load", () => {
      try {
        iframe.contentWindow?.postMessage({
          type: "JAANCH_INIT_FIELDS",
          fields: liveFields
        }, "*");
      } catch (err) {}
    });

    root.appendChild(backdrop);
    root.appendChild(container);
    container.appendChild(iframe);
    document.body.appendChild(root);

    const onKeydown = (e) => {
      if (e.key === "Escape") {
        root.remove();
        document.removeEventListener("keydown", onKeydown);
      }
    };
    document.addEventListener("keydown", onKeydown);
  }

  /**
   * Safely updates DOM input elements with approved values and triggers a green highlight pulse.
   * Core Invariant: NEVER submits the form.
   */
  function applyFieldUpdates(fieldsArray) {
    if (!Array.isArray(fieldsArray)) return 0;
    let updatedCount = 0;

    fieldsArray.forEach((field) => {
      if (!field || !field.id || field.value === undefined) return;
      
      let el = document.getElementById(field.id);
      if (!el && typeof CSS !== "undefined" && CSS.escape) {
        try {
          el = document.querySelector(`[name="${CSS.escape(field.id)}"], [data-jaanch-id="${CSS.escape(field.id)}"]`);
        } catch (e) {}
      }
      if (!el && typeof document !== "undefined" && document.querySelector) {
        try {
          el = document.querySelector(`[name="${field.id}"], [data-jaanch-id="${field.id}"]`);
        } catch (e) {}
      }

      if (el) {
        el.value = field.value;
        try {
          if (typeof Event !== "undefined") {
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } catch (e) {}
        updatedCount++;

        if (el.style) {
          const origOutline = el.style.outline;
          const origBoxShadow = el.style.boxShadow;
          const origTransition = el.style.transition;
          el.style.transition = "all 0.3s ease";
          el.style.outline = "3px solid #2FBF9B";
          el.style.boxShadow = "0 0 12px rgba(47, 191, 155, 0.6)";

          setTimeout(() => {
            el.style.outline = origOutline;
            el.style.boxShadow = origBoxShadow;
            el.style.transition = origTransition;
          }, 2500);
        }
      }
    });

    return updatedCount;
  }

  /**
   * Helper to check if an element is actually visible in DOM (not display:none, not aria-hidden, not detached)
   */
  function isElementVisible(el) {
    if (!el) return false;
    if (typeof el.getAttribute === "function" && el.getAttribute("aria-hidden") === "true") return false;
    if (el.tagName === "DIALOG" && !el.open) return false;
    if (typeof el.offsetParent !== "undefined" && el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    if (typeof window !== "undefined" && window.getComputedStyle) {
      try {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
      } catch (e) {}
    }
    return true;
  }

  /**
   * Determines whether the submit area is visible and unobstructed.
   * Jaanch must remain available while the site's submit control is disabled,
   * since operators need to verify incomplete forms before they can submit.
   */
  function isSubmitAccessible(submitBtn) {
    if (!submitBtn) return false;

    // A disabled site submit button does not disable Jaanch's separate control.
    // Hidden or zero dimensions still mean the submit area is not visible.
    if (typeof submitBtn.offsetParent !== "undefined" && submitBtn.offsetParent === null) {
      if (submitBtn.style && submitBtn.style.display === "none") return false;
    }

    // 3. Check for open modal dialogs or backdrop overlays on page (e.g. Google Forms Clear form modal)
    if (typeof document !== "undefined") {
      try {
        if (typeof document.querySelectorAll === "function") {
          const dialogs = Array.from(document.querySelectorAll(
            'dialog[open], [role="dialog"], [role="alertdialog"], .modal.show, .modal-open, .overlay.active, .backdrop, [data-is-modal="true"], .quantumWizDialogPaperdialogEl'
          ));
          const activeBlockingDialog = dialogs.find((d) => isElementVisible(d) && (!submitBtn.contains || !submitBtn.contains(d)) && (!d.contains || !d.contains(submitBtn)));
          if (activeBlockingDialog) {
            return false;
          }
        } else if (typeof document.querySelector === "function") {
          // Node mock test environment fallback
          const activeDialog = document.querySelector(
            'dialog[open], [role="dialog"], [role="alertdialog"], .modal.show, .modal-open, .overlay.active, .backdrop, [data-is-modal="true"], .quantumWizDialogPaperdialogEl'
          );
          if (activeDialog && (!activeDialog.contains || !activeDialog.contains(submitBtn))) {
            return false;
          }
        }
      } catch (e) {}
    }

    // 4. Hit-testing: is the submit button covered by another element/backdrop?
    if (typeof document !== "undefined" && typeof document.elementFromPoint === "function" && submitBtn.getBoundingClientRect) {
      try {
        const rect = submitBtn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const cx = Math.floor(rect.left + rect.width / 2);
          const cy = Math.floor(rect.top + rect.height / 2);
          if (cx >= 0 && cx <= (window.innerWidth || 10000) && cy >= 0 && cy <= (window.innerHeight || 10000)) {
            const topEl = document.elementFromPoint(cx, cy);
            if (topEl) {
              const isInsideSubmit = submitBtn === topEl || (submitBtn.contains && submitBtn.contains(topEl));
              const isInsideGroup = topEl.closest && topEl.closest(".jaanch-combined-group");
              const isInsideSticker = topEl.closest && (topEl.closest("#jaanch-recheck-root") || topEl.closest(".jaanch-sticker-btn"));
              if (!isInsideSubmit && !isInsideGroup && !isInsideSticker) {
                return false;
              }
            }
          }
        }
      } catch (e) {}
    }

    return true;
  }

  /**
   * Injects the sleek sticker trigger tab overlapping the top-right corner of the submit button.
   * Styled like a stylish sticker/canvas tab with dark green (#1F3B3A) background and cream (#FFF3E6) text.
   * Default: Shows Hindi logo "जाँच" + small right arrow.
   * Hover: Expands smoothly to the right showing "Recheck with Jaanch".
   * Strict Safety: Only operable if the submit button is currently accessible.
   */
  function injectRecheckButton() {
    if (document.getElementById("jaanch-recheck-root")) return;

    // Only inject if there are fillable fields on the page
    const inputs = Array.from(document.querySelectorAll("input, select, textarea")).filter(
      (i) => !isIgnoredField(i)
    );
    if (inputs.length === 0) return;

    const submitTarget = findSubmitButton();
    if (!submitTarget) return;

    const container = document.createElement("div");
    container.id = "jaanch-recheck-root";
    container.style.cssText = `
      position: absolute !important;
      top: -14px !important;
      left: calc(100% - 54px) !important;
      right: auto !important;
      z-index: 2 !important;
      display: inline-flex !important;
      align-items: center !important;
      line-height: normal !important;
      margin: 0 !important;
      padding: 0 !important;
      pointer-events: auto !important;
      white-space: nowrap !important;
    `;

    const shadow = container.attachShadow({ mode: "open" });

    // Stylesheet inside isolated Shadow DOM
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-flex;
        position: relative;
        margin: 0;
        padding: 0;
      }
      .jaanch-arrow-btn,
      .jaanch-sticker-btn {
        height: 24px;
        min-height: 24px;
        background-color: #1F3B3A;
        color: #FFF3E6;
        border: 1.5px solid #FFF3E6;
        border-radius: 8px 8px 4px 4px;
        padding: 0 8px;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 4px;
        cursor: pointer;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.5px;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
        box-shadow: 0 3px 8px rgba(31, 59, 58, 0.35);
        white-space: nowrap;
        overflow: hidden;
        transform-origin: left center;
      }
      .jaanch-sticker-logo {
        font-weight: 800;
        font-size: 12px;
        color: #FFF3E6;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      .jaanch-arrow-icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        stroke: #A7E7D5;
        transition: stroke 0.2s ease, transform 0.2s ease;
      }
      .jaanch-btn-label {
        max-width: 0;
        opacity: 0;
        white-space: nowrap;
        overflow: hidden;
        margin-left: 0;
        color: #FFF3E6;
        font-size: 11px;
        font-weight: 600;
        transition: max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-left 0.2s ease;
      }
      /* Hover State: Expands out to the right */
      .jaanch-arrow-btn:hover:not(:disabled):not(.jaanch-disabled),
      .jaanch-sticker-btn:hover:not(:disabled):not(.jaanch-disabled) {
        background-color: #1F3B3A;
        color: #FFF3E6;
        border-color: #2FBF9B;
        box-shadow: 0 4px 14px rgba(31, 59, 58, 0.45), 0 0 0 1px #2FBF9B;
        padding: 0 10px;
        transform: translateY(-2px);
      }
      .jaanch-arrow-btn:hover:not(:disabled):not(.jaanch-disabled) .jaanch-arrow-icon,
      .jaanch-sticker-btn:hover:not(:disabled):not(.jaanch-disabled) .jaanch-arrow-icon {
        stroke: #2FBF9B;
        transform: translateX(2px);
      }
      .jaanch-arrow-btn:hover:not(:disabled):not(.jaanch-disabled) .jaanch-btn-label,
      .jaanch-sticker-btn:hover:not(:disabled):not(.jaanch-disabled) .jaanch-btn-label {
        max-width: 160px;
        opacity: 1;
        margin-left: 4px;
      }
      .jaanch-arrow-btn:active,
      .jaanch-sticker-btn:active {
        transform: scale(0.96) translateY(-1px);
      }
      /* Disabled / Inaccessible State when Submit is unavailable or covered */
      .jaanch-arrow-btn.jaanch-disabled,
      .jaanch-sticker-btn.jaanch-disabled,
      .jaanch-arrow-btn:disabled,
      .jaanch-sticker-btn:disabled {
        opacity: 0.35 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
        box-shadow: none !important;
        filter: grayscale(0.8) !important;
      }
      .jaanch-arrow-btn.jaanch-disabled:hover,
      .jaanch-sticker-btn.jaanch-disabled:hover {
        transform: none !important;
        padding: 0 8px !important;
      }
      .jaanch-arrow-btn.jaanch-disabled .jaanch-btn-label,
      .jaanch-sticker-btn.jaanch-disabled .jaanch-btn-label {
        max-width: 0 !important;
        opacity: 0 !important;
      }
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "jaanch-arrow-btn jaanch-sticker-btn";
    btn.title = "Recheck with Jaanch";
    btn.innerHTML = `
      <span class="jaanch-sticker-logo">जाँच</span>
      <svg class="jaanch-arrow-icon" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
      <span class="jaanch-btn-label">Recheck with Jaanch</span>
    `;

    function syncStickerState() {
      const accessible = isSubmitAccessible(submitTarget);
      if (accessible) {
        if (btn.classList && typeof btn.classList.remove === "function") {
          btn.classList.remove("jaanch-disabled");
        }
        if (typeof btn.removeAttribute === "function") {
          btn.removeAttribute("disabled");
        }
        if (container.style) {
          container.style.pointerEvents = "auto";
          container.style.opacity = "1";
        }
      } else {
        if (btn.classList && typeof btn.classList.add === "function") {
          btn.classList.add("jaanch-disabled");
        }
        if (typeof btn.setAttribute === "function") {
          btn.setAttribute("disabled", "true");
        }
        if (container.style) {
          container.style.pointerEvents = "none";
          container.style.opacity = "0.45";
        }
      }
    }

    container.addEventListener("mouseenter", syncStickerState);
    container.addEventListener("mouseover", syncStickerState);

    if (typeof MutationObserver !== "undefined") {
      try {
        const submitObserver = new MutationObserver(() => syncStickerState());
        submitObserver.observe(submitTarget, {
          attributes: true,
          attributeFilter: ["disabled", "aria-disabled", "class", "style"]
        });

        if (typeof document !== "undefined" && document.body) {
          const bodyObserver = new MutationObserver(() => syncStickerState());
          bodyObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributeFilter: ["open", "class", "aria-hidden"]
          });
        }
      } catch (e) {}
    }

    syncStickerState();

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Invariant: If Submit is not accessible, Jaanch cannot be triggered
      if (!isSubmitAccessible(submitTarget)) {
        console.log("[Jaanch] Submit button is currently not accessible. Action blocked.");
        return;
      }

      // Single Window Guarantee: If floating dropdown is already open, clicking cleanly toggles it off
      const existing = document.getElementById("jaanch-dropdown-root");
      if (existing) {
        console.log("[Jaanch Sticker] Floating dropdown already open -> closing it.");
        clearJaanchOverlays();
        return;
      }

      const live = discoverFields();
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "RECHECK_CLICKED", fields: Object.values(live) });
      }
      toggleTopFloatingDropdown();
    });

    shadow.appendChild(style);
    shadow.appendChild(btn);

    // Combine submit button and sticker trigger under ONE div wrapper
    if (submitTarget.id === "jaanch-recheck-host") {
      submitTarget.style.position = "relative";
      submitTarget.style.overflow = "visible";
      submitTarget.appendChild(container);
    } else if (submitTarget.parentElement) {
      let wrapper = submitTarget.parentElement;
      const isAlreadyWrapper =
        wrapper.classList &&
        typeof wrapper.classList.contains === "function" &&
        wrapper.classList.contains("jaanch-combined-group");

      if (!isAlreadyWrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "jaanch-combined-group";
        wrapper.style.cssText = `
          display: inline-flex !important;
          align-items: center !important;
          vertical-align: middle !important;
          position: relative !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        `;

        if (typeof window !== "undefined" && window.getComputedStyle) {
          try {
            const comp = window.getComputedStyle(submitTarget);
            if (comp.margin && comp.margin !== "0px") {
              wrapper.style.margin = comp.margin;
            }
          } catch (e) {}
        }

        const parent = submitTarget.parentNode || submitTarget.parentElement;
        if (parent) {
          parent.insertBefore(wrapper, submitTarget);
        }
        wrapper.appendChild(submitTarget);
      }
      wrapper.appendChild(container);
    }
  }

  /**
   * Monitor form submissions & page unloads to wipe ephemeral session data (Core Invariant 5).
   */
  function attachSubmitWipers() {
    // 1. Native form submissions
    const forms = Array.from(document.querySelectorAll("form"));
    forms.forEach((form) => {
      if (form.getAttribute("data-jaanch-wipe-attached")) return;
      form.setAttribute("data-jaanch-wipe-attached", "true");
      form.addEventListener("submit", () => {
        wipeSessionStorage("form_submit");
      });
    });

    // 2. Submit trigger clicks
    const submitTriggers = Array.from(
      document.querySelectorAll(
        'button[type="submit"], input[type="submit"], button[data-automation-id="submitButton"], #gf-btn-submit, div[role="button"]'
      )
    );
    submitTriggers.forEach((btn) => {
      const text = (btn.innerText || btn.value || "").toLowerCase();
      if (
        btn.id === "gf-btn-submit" ||
        btn.type === "submit" ||
        btn.getAttribute("data-automation-id") === "submitButton" ||
        text.includes("submit") ||
        text.includes("सबमिट") ||
        text.includes("जमा करें") ||
        text.includes("proceed") ||
        text.includes("register")
      ) {
        if (btn.getAttribute("data-jaanch-wipe-attached")) return;
        btn.setAttribute("data-jaanch-wipe-attached", "true");
        btn.addEventListener("click", (e) => {
          if (e && e.target && e.target.closest && (
            e.target.closest("#jaanch-recheck-root") ||
            e.target.closest("#jaanch-dropdown-root") ||
            e.target.closest(".jaanch-combined-group > #jaanch-recheck-root") ||
            e.target.closest(".jaanch-sticker-btn")
          )) {
            return;
          }
          wipeSessionStorage("submit_click");
        });
      }
    });

    // 3. Page unload / navigation (wiping ephemeral memory)
    if (typeof window !== "undefined" && !window.__jaanch_unload_attached) {
      window.__jaanch_unload_attached = true;
      window.addEventListener("beforeunload", () => {
        if (typeof window !== "undefined" && window.parent && window.parent !== window) return;
        wipeSessionStorage("page_unload");
      });
    }
  }

  function wipeSessionStorage(reason) {
    console.log(`[Jaanch] Wiping ephemeral session data: reason=${reason}`);
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "SESSION_CLEARED", reason }).catch(() => {});
    }
  }

  // Lifecycle initialization
  function init() {
    clearJaanchOverlays();
    discoverFields();
    injectRecheckButton();
    attachSubmitWipers();

    // Runtime message listener for field extraction, DOM apply, and modal toggle
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "GET_DISCOVERED_FIELDS") {
          const found = discoverFields();
          sendResponse({ fields: found || {} });
          return false;
        }
        if (message.type === "APPLY_FIELD_UPDATES") {
          const count = applyFieldUpdates(message.fields);
          sendResponse({ ok: true, count });
          return false;
        }
        if (message.type === "TOGGLE_TOP_DROPDOWN") {
          toggleTopFloatingDropdown();
          sendResponse({ ok: true });
          return false;
        }
        if (message.type === "CLOSE_TOP_DROPDOWN") {
          const existing = document.getElementById("jaanch-dropdown-root");
          if (existing) existing.remove();
          sendResponse({ ok: true });
          return false;
        }
      });
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }

    // Debounced Dynamic Mutation Observer for SPAs (MS Forms, React, Angular, Vue)
    if (typeof MutationObserver !== "undefined" && document.body) {
      let debounceTimeout = null;
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          discoverFields();
          injectRecheckButton();
          attachSubmitWipers();
        }, 300);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Cross-frame / test postMessage listener
  if (typeof window !== "undefined") {
    window.addEventListener("message", (event) => {
      if (event.data?.type === "JAANCH_POPUP_GET_FIELDS" || event.data?.type === "JAANCH_POPUP_MOUNTED") {
        const live = discoverFields();
        console.log(`[Jaanch DOM Debug] Received ${event.data.type}. Replying with ${Object.keys(live).length} fields.`);
        if (event.source && typeof event.source.postMessage === "function") {
          try {
            event.source.postMessage({
              type: "JAANCH_FIELDS_RESPONSE",
              fields: live
            }, "*");
          } catch (err) {}
        }
        const iframe = document.querySelector("#jaanch-dropdown-card iframe");
        if (iframe?.contentWindow && iframe.contentWindow !== event.source) {
          try {
            iframe.contentWindow.postMessage({
              type: "JAANCH_FIELDS_RESPONSE",
              fields: live
            }, "*");
          } catch (err) {}
        }
      } else if (event.data?.type === "JAANCH_CLOSE_DROPDOWN") {
        const root = document.getElementById("jaanch-dropdown-root");
        if (root) root.remove();
      } else if (event.data?.type === "JAANCH_MOCK_FORM_SUBMITTED") {
        wipeSessionStorage("mock_test_submit");
      }
    });
  }

  // Export for node unit/integration testing
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      inferKind,
      extractLabel,
      discoverFields,
      injectRecheckButton,
      findSubmitButton,
      findRecheckHost: findSubmitButton,
      isIgnoredField,
      toggleTopFloatingDropdown,
      applyFieldUpdates,
      isSubmitAccessible,
    };
  }
})();
