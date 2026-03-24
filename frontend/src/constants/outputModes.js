export const OUTPUT_MODES = {
  CHAT: "chat",
  BUBBLE: "bubble",
  VOICE: "voice",
  BUBBLE_VOICE: "bubble_voice"
};

export const BUBBLE_TYPES = {
  TALK: "talk",
  THINK: "think",
  ALERT: "alert",
  CAPTURE: "capture"
};

export function detectBubbleType(response = "", actionType = "") {
  if (["proactive_comfort", "suggest_break", "alert"].includes(actionType)) {
    return BUBBLE_TYPES.ALERT;
  }

  if (["ocr_result", "screen_capture"].includes(actionType)) {
    return BUBBLE_TYPES.CAPTURE;
  }

  if (response.startsWith("..") || response.includes("(")) {
    return BUBBLE_TYPES.THINK;
  }

  return BUBBLE_TYPES.TALK;
}

export function getBubbleDuration(text = "") {
  return Math.min(8000, 2000 + text.length * 60);
}
