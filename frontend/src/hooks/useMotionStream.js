import { useEffect } from "react";
import { buildApiUrl } from "../services/api";
import { characterController } from "../services/characterController";

export function useMotionStream(conversationId) {
  useEffect(() => {
    const source = new EventSource(buildApiUrl("/mood/stream"));

    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "emotion_update") {
          if (payload.motion_sequence?.length) {
            await characterController.playMotionSequence(
              payload.motion_sequence,
              payload.tension_level ?? 1
            );
            await characterController.returnToDefault(800);
          }

          if (payload.overlay_effect) {
            characterController.showOverlayEffect(payload.overlay_effect);
          }

          window.__pendingTTSParams = {
            speed: payload.tts_speed ?? 1,
            pitch: payload.tts_pitch ?? 1,
            energy: payload.tts_energy ?? 1,
            hint: payload.tts_hint ?? ""
          };
        }

        if (payload.type === "mood_change") {
          if (["FOCUSED", "BUSY"].includes(payload.mood)) {
            characterController.enterSilentPresence();
          } else {
            characterController.exitSilentPresence();
            characterController.startIdleBreathing();
          }
        }
      } catch {}
    };

    return () => source.close();
  }, [conversationId]);
}
