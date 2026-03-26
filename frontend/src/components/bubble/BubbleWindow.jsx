import { useEffect, useState } from "react";
import SpeechBubble from "./SpeechBubble";

const INITIAL_BUBBLE = {
  captureImage: "",
  message: "",
  mood: "IDLE",
  tail: "bottom",
  type: "talk",
  visible: false
};

function BubbleWindow() {
  const [bubble, setBubble] = useState(INITIAL_BUBBLE);

  useEffect(() => {
    const removeDataListener = window.hanaDesktop?.onBubbleData?.((payload) => {
      setBubble({
        captureImage: payload.captureImage || "",
        message: payload.message || "",
        mood: payload.mood || "IDLE",
        tail: payload.tail || "bottom",
        type: payload.type || "talk",
        visible: Boolean(payload.message)
      });
    });
    const removeTailListener = window.hanaDesktop?.onBubbleTail?.((tail) => {
      setBubble((current) => ({ ...current, tail }));
    });

    return () => {
      removeDataListener?.();
      removeTailListener?.();
    };
  }, []);

  return (
    <div className="bubble-window">
      <SpeechBubble {...bubble} />
    </div>
  );
}

export default BubbleWindow;
