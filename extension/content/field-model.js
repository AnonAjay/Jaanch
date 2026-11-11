// Field record construction is kept separate from DOM discovery so the
// content controller can focus on portal events and transport.
globalThis.JaanchFieldModel = Object.freeze({
  create({ id, label, required = false, kind = "text", value = "" }) {
    const normalizedValue = value == null ? "" : String(value);
    const now = Date.now();
    return {
      id,
      label: label || id || "",
      required: Boolean(required),
      kind: kind || "text",
      formValue: normalizedValue,
      value: normalizedValue,
      extractedValue: null,
      pendingCorrection: null,
      transcript: "",
      heardTranscript: "",
      intent: null,
      instruction: null,
      status: "not_checked",
      decision: null,
      editedByUser: false,
      updatedAt: now,
    };
  },
});
