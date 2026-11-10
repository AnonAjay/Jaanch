/**
 * Jaanch Voice Activity Detection & 16kHz WAV Recorder (extension/lib/vad.js)
 * Captures microphone stream, continuous hands-free background listening,
 * instant barge-in detection, and encodes 16kHz mono WAV for Gnani STT.
 * Zero external dependencies.
 */

let mediaStream = null;
let mediaStreamSource = null;
let audioContext = null;
let scriptProcessor = null;
let analyserNode = null;
let animationFrameId = null;

let isRecording = false;
let pcmSamples = [];
let speechDetected = false;
let silenceTimer = null;
let maxTimeoutTimer = null;

// Continuous Listening State
let continuousActive = false;
let isPaused = false;
let continuousSpeechActive = false;
let continuousSilenceTimer = null;
let continuousBuffer = [];

function downsampleTo16k(inputData, inputSampleRate) {
  if (inputSampleRate === 16000) return inputData;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;
  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < inputData.length; i++) {
      accum += inputData[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

function encode16kWavBlob(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, 16000, true); // 16kHz
  view.setUint32(28, 32000, true); // byte rate: 16000 * 2
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

/**
 * Starts continuous background listening with instant barge-in detection.
 * Does NOT send audio on timers. Detects speech energy locally using Web Audio API (0 credits on silence).
 * Triggers onSpeechStart() the moment human speech begins (caller cuts off TTS).
 * Triggers onSpeechEnd(wavBlob) once complete utterance has ended.
 */
export async function startContinuousListening(options = {}) {
  const onSpeechStart = options.onSpeechStart || (() => {});
  const onSpeechEnd = options.onSpeechEnd || (() => {});
  const onLevelChange = options.onLevelChange || (() => {});
  const isAudioPlayingRef = options.isAudioPlayingRef || (() => false);
  const silenceTimeoutSec = options.silenceTimeoutSec || 0.65;

  cancelVoiceCapture();
  continuousActive = true;
  isPaused = false;
  continuousSpeechActive = false;
  continuousBuffer = [];

  if (!mediaStream || !mediaStream.active || (mediaStream.getAudioTracks && mediaStream.getAudioTracks().every(t => t.readyState === "ended"))) {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  }

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch (e) {
      console.warn("[Jaanch VAD Debug] AudioContext resume failed:", e);
    }
  }

  cleanUpAudioNodes();

  mediaStreamSource = audioContext.createMediaStreamSource(mediaStream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 512;
  mediaStreamSource.connect(analyserNode);

  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  scriptProcessor.onaudioprocess = (e) => {
    // Zero out outputBuffer so mic input is NEVER echoed into speakers (eliminates audio feedback)
    const output = e.outputBuffer.getChannelData(0);
    output.fill(0);

    if (!continuousActive || isPaused) return;

    const input = e.inputBuffer.getChannelData(0);

    // RMS Energy Calculation
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * input[i];
    }
    const rms = Math.sqrt(sum / input.length);
    onLevelChange(rms);

    // Dynamic sensitivity: If TTS is actively speaking, require higher threshold (0.035) for barge-in cutoff
    // When idle/listening, use sensitive threshold (0.008) so normal speaking volume is reliably detected
    const isPlaying = isAudioPlayingRef();
    const threshold = isPlaying ? 0.035 : 0.008;

    if (rms > threshold) {
      if (!continuousSpeechActive) {
        continuousSpeechActive = true;
        continuousBuffer = [];
        console.log(`[Jaanch VAD Debug] Human speech detected (RMS: ${rms.toFixed(4)} > ${threshold}). Triggering onSpeechStart.`);
        onSpeechStart(); // Instantly cuts off TTS!
      }
      if (continuousSilenceTimer) {
        clearTimeout(continuousSilenceTimer);
        continuousSilenceTimer = null;
      }
    }

    if (continuousSpeechActive) {
      const resampled = downsampleTo16k(input, audioContext.sampleRate);
      for (let i = 0; i < resampled.length; i++) {
        continuousBuffer.push(resampled[i]);
      }

      if (rms <= threshold && !continuousSilenceTimer) {
        continuousSilenceTimer = setTimeout(() => {
          if (!continuousSpeechActive) return;
          continuousSpeechActive = false;
          continuousSilenceTimer = null;

          // If utterance is >= 150ms (2400 samples at 16kHz), deliver clean speech blob
          if (continuousBuffer.length >= 2400) {
            const wavBlob = encode16kWavBlob(continuousBuffer);
            console.log(`[Jaanch VAD Debug] Speech utterance completed (${wavBlob.size} bytes). Delivering to Gnani STT.`);
            continuousBuffer = [];
            onSpeechEnd(wavBlob);
          } else {
            continuousBuffer = [];
          }
        }, silenceTimeoutSec * 1000);
      }
    }
  };

  mediaStreamSource.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  return {
    pause: () => {
      isPaused = true;
      continuousSpeechActive = false;
      continuousBuffer = [];
      if (continuousSilenceTimer) clearTimeout(continuousSilenceTimer);
    },
    resume: () => {
      isPaused = false;
      continuousSpeechActive = false;
      continuousBuffer = [];
      resumeVadAudioContext();
    },
    stop: () => {
      continuousActive = false;
      cancelVoiceCapture();
    }
  };
}

export function pauseContinuousListening() {
  isPaused = true;
  continuousSpeechActive = false;
  continuousBuffer = [];
  if (continuousSilenceTimer) clearTimeout(continuousSilenceTimer);
}

export function resumeContinuousListening() {
  isPaused = false;
  continuousSpeechActive = false;
  continuousBuffer = [];
  resumeVadAudioContext();
}

/**
 * Explicitly resumes the VAD's internal AudioContext if suspended by Chrome autoplay policy.
 */
export function resumeVadAudioContext() {
  if (typeof window === "undefined") return;
  try {
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume().then(() => {
        console.log("[Jaanch VAD Debug] VAD AudioContext resumed successfully.");
      }).catch((e) => {
        console.warn("[Jaanch VAD Debug] Failed to resume VAD AudioContext:", e);
      });
    }
  } catch (e) {
    console.warn("[Jaanch VAD Debug] Error resuming VAD AudioContext:", e);
  }
}

/**
 * Single-shot voice capture (kept for backward compatibility & direct manual mic triggers).
 */
export async function startVoiceCapture(options = {}) {
  const onSpeechStart = options.onSpeechStart || (() => {});
  const onSpeechEnd = options.onSpeechEnd || (() => {});
  const onLevelChange = options.onLevelChange || (() => {});
  const maxDurationSec = options.maxDurationSec || 7.0;
  const silenceTimeoutSec = options.silenceTimeoutSec || 1.2;

  cancelVoiceCapture();

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  mediaStreamSource = audioContext.createMediaStreamSource(mediaStream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 512;
  mediaStreamSource.connect(analyserNode);

  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  pcmSamples = [];
  isRecording = true;
  speechDetected = false;

  return new Promise((resolve) => {
    function finishRecording() {
      if (!isRecording) return;
      isRecording = false;
      onSpeechEnd();

      if (silenceTimer) clearTimeout(silenceTimer);
      if (maxTimeoutTimer) clearTimeout(maxTimeoutTimer);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      const wavBlob = encode16kWavBlob(pcmSamples);
      cleanUpAudioNodes();
      resolve(wavBlob);
    }

    maxTimeoutTimer = setTimeout(() => {
      finishRecording();
    }, maxDurationSec * 1000);

    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      const resampled = downsampleTo16k(input, audioContext.sampleRate);
      for (let i = 0; i < resampled.length; i++) {
        pcmSamples.push(resampled[i]);
      }

      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);
      onLevelChange(rms);

      const LOUDNESS_THRESHOLD = 0.035;

      if (rms > LOUDNESS_THRESHOLD) {
        if (!speechDetected) {
          speechDetected = true;
          onSpeechStart();
        }
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else if (speechDetected && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          finishRecording();
        }, silenceTimeoutSec * 1000);
      }
    };

    mediaStreamSource.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);
  });
}

export function cancelVoiceCapture() {
  isRecording = false;
  continuousActive = false;
  continuousSpeechActive = false;
  speechDetected = false;
  pcmSamples = [];
  continuousBuffer = [];

  if (silenceTimer) clearTimeout(silenceTimer);
  if (continuousSilenceTimer) clearTimeout(continuousSilenceTimer);
  if (maxTimeoutTimer) clearTimeout(maxTimeoutTimer);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  silenceTimer = null;
  continuousSilenceTimer = null;
  maxTimeoutTimer = null;
  animationFrameId = null;

  cleanUpAudioNodes();
}

export function isContinuousListeningActive() {
  return continuousActive && !isPaused && scriptProcessor !== null && audioContext !== null && audioContext.state === "running";
}

function cleanUpAudioNodes() {
  if (scriptProcessor) {
    try { scriptProcessor.disconnect(); } catch (e) {}
    scriptProcessor = null;
  }
  if (analyserNode) {
    try { analyserNode.disconnect(); } catch (e) {}
    analyserNode = null;
  }
  if (mediaStreamSource) {
    try { mediaStreamSource.disconnect(); } catch (e) {}
    mediaStreamSource = null;
  }
}
