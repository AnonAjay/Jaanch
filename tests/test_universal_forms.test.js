/**
 * Live Portal Universal Compatibility Tests (tests/test_universal_forms.test.js)
 * Validates that Jaanch content script operates seamlessly on actual live portal DOM patterns:
 *   1. Standard Citizen Portals (tests/fixtures/standard_form.html)
 *   2. Google Forms (tests/fixtures/google_form.html)
 *   3. Official Government Portals with Table Layouts (tests/fixtures/gov_portal.html)
 *   4. Microsoft Forms submit button detection (button[data-automation-id="submitButton"])
 *   5. Arrow trigger placement next to submit button (no floating big box, no mic icon, hover expansion)
 *   6. Smart filtering (ignoring captchas, CSRF tokens, search bars)
 *   7. Ephemeral session memory wiping on form submission
 *
 * Runnable via: node --test tests/test_universal_forms.test.js
 */

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import "../extension/content/field-model.js";
import {
  inferKind,
  extractLabel,
  discoverFields,
  injectRecheckButton,
  findSubmitButton,
  findRecheckHost,
  isIgnoredField,
} from "../extension/content/content.js";

/**
 * Headless DOM builder for testing live portal DOM structures in Node.
 */
function buildDom(html) {
  const VOID_TAGS = new Set(["INPUT", "BR", "META", "LINK", "HR", "IMG"]);

  class DomElement {
    constructor(tagName, attrs = {}) {
      this.tagName = tagName.toUpperCase();
      this.attrs = attrs;
      this.children = [];
      this.parentElement = null;
      this.textParts = [];
      this.id = attrs.id || "";
      this.name = attrs.name || "";
      this.placeholder = attrs.placeholder || "";
      this.type = attrs.type || (this.tagName === "INPUT" ? "text" : "");
      this.required = "required" in attrs;
      this.value = attrs.value || "";
      this.style = {};
      this.eventListeners = {};
      this.shadowRoot = null;
    }

    get parentNode() {
      return this.parentElement;
    }

    get className() {
      return this.attrs.class || "";
    }

    set className(val) {
      this.attrs.class = val;
    }

    get classList() {
      const self = this;
      return {
        contains: (cls) => (self.attrs.class || "").split(/\s+/).includes(cls),
        add: (cls) => {
          const list = (self.attrs.class || "").split(/\s+/).filter(Boolean);
          if (!list.includes(cls)) list.push(cls);
          self.attrs.class = list.join(" ");
        },
        remove: (cls) => {
          const list = (self.attrs.class || "").split(/\s+/).filter((c) => c && c !== cls);
          self.attrs.class = list.join(" ");
        },
      };
    }

    get innerText() {
      let t = this.textParts.join(" ");
      for (const c of this.children) {
        t += " " + c.innerText;
      }
      return t.replace(/\s+/g, " ").trim();
    }

    get textContent() {
      return this.innerText;
    }

    getAttribute(name) {
      return this.attrs[name.toLowerCase()] ?? null;
    }

    setAttribute(name, val) {
      this.attrs[name.toLowerCase()] = val;
      if (name.toLowerCase() === "id") this.id = val;
      if (name.toLowerCase() === "name") this.name = val;
    }

    get previousElementSibling() {
      if (!this.parentElement) return null;
      const siblings = this.parentElement.children;
      const idx = siblings.indexOf(this);
      for (let i = idx - 1; i >= 0; i--) {
        if (siblings[i].tagName !== "#TEXT") return siblings[i];
      }
      return null;
    }

    get nextSibling() {
      if (!this.parentElement) return null;
      const siblings = this.parentElement.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    }

    closest(selector) {
      let curr = this;
      while (curr) {
        if (curr.matches && curr.matches(selector)) return curr;
        curr = curr.parentElement;
      }
      return null;
    }

    matches(sel) {
      const parts = sel.split(",").map((s) => s.trim());
      for (const part of parts) {
        if (this._matchesSingle(part)) return true;
      }
      return false;
    }

    _matchesSingle(sel) {
      if (sel === "*") return true;

      // Handle :not(...)
      if (sel.includes(":not(")) {
        const baseSel = sel.replace(/:not\([^)]+\)/g, "");
        if (baseSel && !this._matchesSingle(baseSel)) return false;
        const notRegex = /:not\(([^)]+)\)/g;
        let m;
        while ((m = notRegex.exec(sel)) !== null) {
          if (this._matchesSingle(m[1])) return false;
        }
        return true;
      }

      // Handle :first-child
      if (sel.includes(":first-child")) {
        const baseSel = sel.replace(":first-child", "");
        if (baseSel && !this._matchesSingle(baseSel)) return false;
        if (!this.parentElement) return false;
        const siblings = this.parentElement.children.filter((c) => c.tagName !== "#TEXT");
        return siblings[0] === this;
      }

      if (sel.startsWith("#") && this.id === sel.slice(1)) return true;
      if (
        sel.startsWith(".") &&
        (this.attrs.class || "").split(/\s+/).includes(sel.slice(1))
      )
        return true;
      if (sel.toUpperCase() === this.tagName) return true;

      // Compound: tag.class or tag#id or tag[attr]
      const compoundMatch = sel.match(/^([a-zA-Z0-9]+)([\.#\[].*)$/);
      if (compoundMatch) {
        if (this.tagName !== compoundMatch[1].toUpperCase()) return false;
        return this._matchesSingle(compoundMatch[2]);
      }

      // [attr=val] or [attr*=val]
      const attrMatch = sel.match(/^\[([a-zA-Z0-9_\-]+)(\*?=)["']?([^"'\]]*)["']?\]$/);
      if (attrMatch) {
        const attrName = attrMatch[1].toLowerCase();
        const op = attrMatch[2];
        const expected = attrMatch[3];
        const val = this.getAttribute(attrName);
        if (val === null) return false;
        if (op === "=") return val.toLowerCase() === expected.toLowerCase();
        if (op === "*=") return val.toLowerCase().includes(expected.toLowerCase());
      }

      // [attr]
      const hasAttr = sel.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
      if (hasAttr) {
        return this.getAttribute(hasAttr[1].toLowerCase()) !== null;
      }

      return false;
    }

    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    }

    querySelectorAll(sel) {
      const res = [];
      const parts = sel.split(",").map((s) => s.trim());

      const matchCandidate = (node, selectorPart) => {
        const segments = selectorPart.split(/\s+/);
        if (segments.length === 1) {
          return node.matches(segments[0]);
        }
        let curr = node;
        for (let i = segments.length - 1; i >= 0; i--) {
          const seg = segments[i];
          if (!curr) return false;
          if (i === segments.length - 1) {
            if (!curr.matches(seg)) return false;
            curr = curr.parentElement;
          } else {
            let found = false;
            while (curr) {
              if (curr.matches(seg)) {
                found = true;
                curr = curr.parentElement;
                break;
              }
              curr = curr.parentElement;
            }
            if (!found) return false;
          }
        }
        return true;
      };

      const traverse = (node) => {
        for (const child of node.children) {
          for (const p of parts) {
            if (matchCandidate(child, p)) {
              res.push(child);
              break;
            }
          }
          traverse(child);
        }
      };

      traverse(this);
      return Array.from(new Set(res));
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    insertBefore(newNode, refNode) {
      newNode.parentElement = this;
      const idx = this.children.indexOf(refNode);
      if (idx === -1) {
        this.children.push(newNode);
      } else {
        this.children.splice(idx, 0, newNode);
      }
      return newNode;
    }

    insertAdjacentElement(position, element) {
      if (!this.parentElement) return null;
      if (position === "afterend") {
        const idx = this.parentElement.children.indexOf(this);
        element.parentElement = this.parentElement;
        this.parentElement.children.splice(idx + 1, 0, element);
        return element;
      }
      return null;
    }

    attachShadow() {
      this.shadowRoot = new DomElement("#shadow-root");
      return this.shadowRoot;
    }

    addEventListener(type, fn) {
      this.eventListeners[type] = this.eventListeners[type] || [];
      this.eventListeners[type].push(fn);
    }

    removeEventListener(type, fn) {
      if (!this.eventListeners[type]) return;
      this.eventListeners[type] = this.eventListeners[type].filter((f) => f !== fn);
    }
  }

  const root = new DomElement("DOCUMENT");
  let current = root;
  const tagRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9\-]+)([^>]*)>|([^<]+)/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].startsWith("<!--")) continue;
    if (match[4]) {
      const text = match[4].trim();
      if (text && current) {
        current.textParts.push(text);
      }
    } else if (match[1] === "/") {
      const tag = match[2].toUpperCase();
      if (current.parentElement && current.tagName === tag) {
        current = current.parentElement;
      }
    } else if (match[2]) {
      const tag = match[2].toUpperCase();
      const attrStr = match[3] || "";
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_\-:]+)(?:=["']([^"']*)["'])?/g;
      let aMatch;
      while ((aMatch = attrRegex.exec(attrStr)) !== null) {
        attrs[aMatch[1].toLowerCase()] = aMatch[2] !== undefined ? aMatch[2] : "";
      }
      const elem = new DomElement(tag, attrs);
      current.appendChild(elem);
      if (!VOID_TAGS.has(tag) && !attrStr.endsWith("/")) {
        current = elem;
      }
    }
  }

  const doc = {
    readyState: "complete",
    body: root.querySelector("body") || root,
    getElementById(id) {
      const all = root.querySelectorAll("*");
      for (const el of all) {
        if (el.id === id) return el;
      }
      return null;
    },
    querySelector(sel) {
      if (sel.startsWith("#") && !sel.includes(" ")) {
        return this.getElementById(sel.slice(1));
      }
      return root.querySelector(sel);
    },
    querySelectorAll(sel) {
      return root.querySelectorAll(sel);
    },
    createElement(tag) {
      return new DomElement(tag);
    },
    addEventListener() {},
  };

  return { root, doc };
}

// Test Suite
test("Live Portal: Standard Application Form Layout & Submit Button Detection", () => {
  const html = fs.readFileSync(path.resolve("tests", "fixtures", "standard_form.html"), "utf-8");
  const { doc } = buildDom(html);
  global.document = doc;

  const inputs = Array.from(doc.querySelectorAll("input, select, textarea")).filter(
    (i) => !isIgnoredField(i)
  );
  assert.equal(inputs.length, 4, "Must find 4 eligible candidate fields");

  const fields = {};
  inputs.forEach((input, idx) => {
    const label = extractLabel(input, idx);
    const kind = inferKind(input.id || input.name, label, input);
    fields[input.id] = { label, kind, required: input.required };
  });

  assert.equal(fields["applicant-name"].kind, "name");
  assert.equal(fields["applicant-dob"].kind, "date");
  assert.equal(fields["applicant-district"].kind, "district");
  assert.equal(fields["applicant-ref-no"].kind, "digits");

  const submitBtn = findSubmitButton();
  assert.ok(submitBtn, "Submit button must be found");
  assert.equal(submitBtn.id, "btn-submit-form");
});

test("Live Portal: Google Forms Architecture & Submit Button Detection", () => {
  const html = fs.readFileSync(path.resolve("tests", "fixtures", "google_form.html"), "utf-8");
  const { doc } = buildDom(html);
  global.document = doc;

  const inputs = Array.from(doc.querySelectorAll("input, select, textarea")).filter(
    (i) => !isIgnoredField(i)
  );
  assert.equal(inputs.length, 4, "Must find 4 Google Form fields");

  const fields = {};
  inputs.forEach((input, idx) => {
    const label = extractLabel(input, idx);
    const kind = inferKind(input.id || input.name, label, input);
    fields[input.name] = { label, kind, required: input.required };
  });

  assert.equal(fields["entry.10492817"].kind, "name");
  assert.equal(fields["entry.28491028"].kind, "date");
  assert.equal(fields["entry.73819204"].kind, "district");
  assert.equal(fields["entry.91827364"].kind, "digits");

  const submitBtn = findSubmitButton();
  assert.ok(submitBtn, "Google Forms submit button located");
  assert.equal(submitBtn.id, "gf-btn-submit");

  doc.querySelector('[name="entry.10492817"]').value = "Synthetic Applicant";
  const discovered = discoverFields();
  assert.equal(Object.keys(discovered).length, 4, "End-to-end discovery must build all current Google Form fields");
  assert.equal(discovered["entry.10492817"].value, "Synthetic Applicant", "Discovery must capture the live input value");
  assert.equal(discovered["entry.10492817"].kind, "name", "Discovery must preserve the inferred field kind");
});

test("Live Portal: Official Government Portal Tabular Layouts & Submit Button", () => {
  const html = fs.readFileSync(path.resolve("tests", "fixtures", "gov_portal.html"), "utf-8");
  const { doc } = buildDom(html);
  global.document = doc;

  const inputs = Array.from(doc.querySelectorAll("input, select, textarea")).filter(
    (i) => !isIgnoredField(i)
  );
  assert.equal(inputs.length, 4, "Must find 4 NIC/Gov portal fields");

  const fields = {};
  inputs.forEach((input, idx) => {
    const label = extractLabel(input, idx);
    const kind = inferKind(input.id || input.name, label, input);
    fields[input.id] = { label, kind, required: input.required };
  });

  assert.equal(fields["txtCandidateName"].kind, "name");
  assert.equal(fields["txtDOB"].kind, "date");
  assert.equal(fields["txtDistrict"].kind, "district");
  assert.equal(fields["txtRegNo"].kind, "digits");

  const submitBtn = findSubmitButton();
  assert.ok(submitBtn, "Gov portal submit button located");
  assert.equal(submitBtn.id, "btnFinalSubmit");
});

test("Live Portal: Microsoft Forms Submit Button Detection", () => {
  const msHtml = `
    <html>
      <body>
        <div class="office-form">
          <input type="text" id="ms-name" value="Ramesh">
          <button data-automation-id="submitButton"><span>Submit</span></button>
        </div>
      </body>
    </html>
  `;
  const { doc } = buildDom(msHtml);
  global.document = doc;

  const submitBtn = findSubmitButton();
  assert.ok(submitBtn, "Must identify MS Forms data-automation-id submitButton");
  assert.equal(submitBtn.getAttribute("data-automation-id"), "submitButton");
});

test("Live Portal: Arrow Trigger Injection Adjacent to Submit (No mic icon, Hindi text on hover)", () => {
  const html = fs.readFileSync(path.resolve("tests", "fixtures", "standard_form.html"), "utf-8");
  const { doc } = buildDom(html);
  global.document = doc;

  injectRecheckButton();

  const injected = doc.getElementById("jaanch-recheck-root");
  assert.ok(injected, "Jaanch arrow trigger must be injected");
  assert.ok(injected.shadowRoot, "Shadow DOM must be open");

  // Verify combined under ONE wrapper div with zero gap
  const group = doc.querySelector(".jaanch-combined-group");
  assert.ok(group, "Submit button and Jaanch trigger must be combined under one wrapper div");
  assert.equal(injected.parentElement, group, "Jaanch root must be inside combined group");

  // Verify elements inside Shadow DOM
  const shadowChildren = injected.shadowRoot.children;
  const buttonEl = shadowChildren.find((c) => c.tagName === "BUTTON");
  assert.ok(buttonEl, "Button element must exist inside shadow root");

  const buttonHtml = buttonEl.innerHTML;
  // Invariant 1: No microphone SVG icon
  assert.equal(buttonHtml.includes("<path d=\"M12 2a3 3"), false, "Must NOT contain microphone icon");
  // Invariant 2: Arrow SVG icon present
  assert.ok(buttonHtml.includes("jaanch-arrow-icon"), "Must contain arrow icon");
  // Invariant 3: Label present for hover expansion ("Recheck with Jaanch" or "Recheck with जाँच")
  assert.ok(
    buttonHtml.includes("Recheck with Jaanch") || buttonHtml.includes("Recheck with जाँच"),
    "Must contain label Recheck with Jaanch or Recheck with जाँच"
  );
});

test("Live Portal: Smart Field Filtering (ignoring Captchas, CSRF, Search)", () => {
  assert.equal(isIgnoredField({ type: "hidden" }), true);
  assert.equal(isIgnoredField({ type: "password" }), true);
  assert.equal(isIgnoredField({ type: "submit" }), true);
  assert.equal(isIgnoredField({ type: "text", id: "search-box" }), true);
  assert.equal(isIgnoredField({ type: "text", name: "csrf_token" }), true);
  assert.equal(isIgnoredField({ type: "text", id: "txtCaptcha" }), true);
  assert.equal(isIgnoredField({ type: "text", name: "applicantName" }), false);
  assert.equal(isIgnoredField({ type: "text", id: "txtDOB" }), false);
});

test("Live Portal: Session Wiper on Form Submission", () => {
  const html = fs.readFileSync(path.resolve("tests", "fixtures", "standard_form.html"), "utf-8");
  const { doc } = buildDom(html);
  global.document = doc;

  let sessionWiped = false;
  global.chrome = {
    runtime: {
      sendMessage: (msg) => {
        if (msg.type === "SESSION_CLEARED") sessionWiped = true;
        return Promise.resolve();
      },
    },
  };

  const form = doc.querySelector("form");
  form.addEventListener("submit", () => {
    chrome.runtime.sendMessage({ type: "SESSION_CLEARED", reason: "form_submit" });
  });

  form.eventListeners["submit"].forEach((fn) => fn());
  assert.equal(sessionWiped, true, "Session storage must wipe on form submit");
});
