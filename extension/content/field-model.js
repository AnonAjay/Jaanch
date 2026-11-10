// Field record construction is kept separate from DOM discovery so the
// content controller can focus on portal events and transport.
globalThis.JaanchFieldModel = Object.freeze({
  create({ id, label, required, kind, value }) {
    return { id, label, required, kind, value, status: "not_checked", decision: null };
  },
});
