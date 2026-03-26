/**
 * 음성 입출력 서비스.
 * STT: 마이크 녹음 → /voice/stt → 텍스트
 * TTS: 텍스트 → /voice/tts → 오디오 재생
 */

import { buildApiUrl } from "./api";

// ---------------------------------------------------------------------------
// STT
// ---------------------------------------------------------------------------

/**
 * AudioBlob을 /voice/stt에 전송해 텍스트로 변환한다.
 * @param {Blob} audioBlob - MediaRecorder가 생성한 오디오 Blob
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function transcribeBlob(audioBlob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.wav");

  const res = await fetch(buildApiUrl("/voice/stt"), {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail?.message || `STT 실패: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

/**
 * 텍스트를 /voice/tts에 전송해 WAV로 변환 후 재생한다.
 * @param {string} text - 합성할 텍스트
 * @param {{ mood?: string, speed?: number, pitch?: number, energy?: number }} params
 * @returns {Promise<void>}
 */
export async function speak(text, params = {}) {
  const body = {
    text,
    mood: params.mood || "IDLE",
    speed: params.speed ?? 1.0,
    pitch: params.pitch ?? 0.0,
    energy: params.energy ?? 1.0
  };

  const res = await fetch(buildApiUrl("/voice/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail?.message || `TTS 실패: ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = resolve;
    audio.onerror = reject;
    audio.play().catch(reject);
  });

  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// MediaRecorder 헬퍼
// ---------------------------------------------------------------------------

/**
 * 마이크 녹음을 시작하고, stop 함수와 녹음 완료 Promise를 반환한다.
 * @returns {Promise<{stop: () => void, blobPromise: Promise<Blob>}>}
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  let resolve;
  const blobPromise = new Promise((res) => { resolve = res; });

  const chunks = [];
  const recorder = new MediaRecorder(stream);

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/wav" });
    stream.getTracks().forEach((t) => t.stop());
    resolve(blob);
  };

  recorder.start();

  return {
    stop: () => recorder.stop(),
    blobPromise
  };
}
