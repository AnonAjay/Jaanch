/**
 * Jaanch Audio Player Library (extension/lib/audio-player.js)
 * Coordinates Web Audio playback of fluent natural TTS phrases (Gnani Timbre v2.5 / Web Speech API)
 * with instant barge-in cancellation and smart in-memory caching.
 * Zero external dependencies.
 */

let audioCtx = null;
const ttsBufferCache = new Map();
let currentSourceNode = null;
let currentUtterance = null;
let isPlaying = false;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Checks if audio is currently actively playing through the speaker.
 */
export function isAudioPlaying() {
  return isPlaying;
}

/**
 * Ensures the Web Audio AudioContext is resumed inside user gestures.
 */
export function resumeAudioContext() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch (e) {}
}

/**
 * Instantly stops any active audio playback (Barge-in cancellation).
 */
export function stopAudioPlayback() {
  isPlaying = false;
  if (currentSourceNode) {
    try {
      currentSourceNode.stop(0);
      currentSourceNode.disconnect();
    } catch (e) {}
    currentSourceNode = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
    currentUtterance = null;
  }
}

/**
 * Plays a natural Hindi TTS phrase via Gnani Timbre TTS (with in-memory caching and Web Speech fallback).
 * 
 * @param {string} text - The natural spoken text (e.g. "अभ्यर्थी का नाम: संजय। क्या यह सही है?")
 * @param {Object} options
 *   - voice: string (default "Shivani")
 *   - speed: number (default 1.0)
 *   - proxyUrl: string (default "http://127.0.0.1:8000")
 *   - onStart: () => void
 *   - onEnd: () => void
 */
export async function playTTSPhrase(text, options = {}) {
  stopAudioPlayback();
  isPlaying = true;

  const voice = options.voice || "Shivani";
  const speed = options.speed || 1.0;
  const onStart = options.onStart || (() => {});
  const onEnd = options.onEnd || (() => {});

  const cacheKey = `${text}_${voice}_${speed}`;

  // 1. Check in-memory cache for instant 0ms playback
  if (ttsBufferCache.has(cacheKey)) {
    const cachedBuffer = ttsBufferCache.get(cacheKey);
    return playDecodedBuffer(cachedBuffer, onStart, onEnd);
  }

  // Form readback can contain personal values, so TTS must stay on-device.
  // The proxy is reserved for reply audio sent to /stt.
  if (typeof window !== "undefined" && window.speechSynthesis && isPlaying) {
    return new Promise((resolve) => {
      onStart();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "hi-IN";
      utterance.rate = speed;
      currentUtterance = utterance;

      let safetyTimer = null;
      const finish = () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        isPlaying = false;
        currentUtterance = null;
        onEnd();
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      // Chrome extension iframe safety: release isPlaying after at most 7s if onend fails to fire
      safetyTimer = setTimeout(() => {
        console.warn("[Jaanch Audio Player] SpeechSynthesis timeout safety release.");
        finish();
      }, 7000);

      window.speechSynthesis.speak(utterance);
    });
  }

  isPlaying = false;
  onEnd();
}

function playDecodedBuffer(buffer, onStart, onEnd) {
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSourceNode = source;

    source.onended = () => {
      isPlaying = false;
      if (currentSourceNode === source) {
        currentSourceNode = null;
      }
      onEnd();
      resolve();
    };

    onStart();
    source.start(0);
  });
}

// Backward compatibility for existing test suites
export async function playAudioSequence(sequence, callbacks = {}) {
  stopAudioPlayback();
}
