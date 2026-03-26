import {
  BUBBLE_TYPES,
  OUTPUT_MODES,
  detectBubbleType,
  getBubbleDuration
} from "../constants/outputModes";
import { ttsService as sharedTtsService } from "../services/tts";

export function useOutputMode(settings, options = {}) {
  const ttsService = options.ttsService || sharedTtsService;
  const bubbleApi = options.bubbleApi || window.hanaDesktop;

  async function handleResponse(text, actionType, ttsParams = {}, onChatText) {
    const mode = settings.outputMode || OUTPUT_MODES.CHAT;
    const bubbleType = detectBubbleType(text, actionType);
    const duration = getBubbleDuration(text);

    if (mode === OUTPUT_MODES.CHAT) {
      onChatText?.(text);
      return { bubbleType: BUBBLE_TYPES.TALK, duration };
    }

    if (mode === OUTPUT_MODES.BUBBLE) {
      bubbleApi?.showBubble?.({
        message: text,
        type: bubbleType,
        duration
      });
      return { bubbleType, duration };
    }

    if (mode === OUTPUT_MODES.VOICE) {
      await ttsService.speak(text, ttsParams);
      return { bubbleType, duration };
    }

    bubbleApi?.showBubble?.({
      message: text,
      type: bubbleType,
      duration
    });
    await ttsService.speak(text, ttsParams);
    return { bubbleType, duration };
  }

  return { handleResponse };
}
