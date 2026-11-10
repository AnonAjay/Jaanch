# Always-on rules (short mirror of AGENTS.md)
- Synthetic data only; mock portal only.
- Keys only in proxy env; never in extension, repo, logs, or chat.
- Extension never edits or submits the form; the operator decides.
- No LLM in v1. Any extracted value must appear verbatim in the transcript.
- Spoken prompts name the field and value; no "this/that/or".
- State in chrome.storage.session only; wipe on submit/close/30 min idle.
- Minimal permissions; never <all_urls>.
- Claims only from measured results. Never invent API behaviour; probe it.
- Stay in your ownership lane (see AGENTS.md). Update .agents/memory/STATE.md after each task.
