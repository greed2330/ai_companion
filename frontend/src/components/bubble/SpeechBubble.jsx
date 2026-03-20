import { useEffect, useState } from "react";
import PropTypes from "prop-types";

export const BUBBLE_TYPES = {
  TALK: "talk",
  THINK: "think",
  ALERT: "alert",
  CAPTURE: "capture"
};

export const BUBBLE_COLORS = {
  IDLE: "#2a2a2a",
  HAPPY: "#f5a623",
  CONCERNED: "#e05252",
  FOCUSED: "#4287f5",
  CURIOUS: "#9b42f5",
  GAMING: "#42f554",
  SLEEPY: "#666699"
};

function normalizeBubbleType(type, captureImage) {
  if (type === BUBBLE_TYPES.CAPTURE && !captureImage) {
    return BUBBLE_TYPES.ALERT;
  }

  return Object.values(BUBBLE_TYPES).includes(type) ? type : BUBBLE_TYPES.TALK;
}

function SpeechBubble({
  captureImage = "",
  message,
  mood,
  tail = "bottom",
  type = BUBBLE_TYPES.TALK,
  visible
}) {
  const [isShown, setIsShown] = useState(visible);
  const bubbleType = normalizeBubbleType(type, captureImage);

  useEffect(() => {
    if (!visible || !message) {
      setIsShown(false);
      return undefined;
    }

    setIsShown(true);
    const timer = window.setTimeout(() => {
      window.hanaDesktop?.hideBubble?.();
      setIsShown(false);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [message, visible]);

  if (!isShown || !message) {
    return null;
  }

  return (
    <div
      className={[
        "speech-bubble",
        `speech-bubble--${bubbleType}`,
        `bubble-tail-${tail}`
      ].join(" ")}
      data-testid="speech-bubble"
      style={{
        backgroundColor: BUBBLE_COLORS[mood] || BUBBLE_COLORS.IDLE,
        "--bubble-color": BUBBLE_COLORS[mood] || BUBBLE_COLORS.IDLE
      }}
    >
      {captureImage ? (
        <img
          alt=""
          className="speech-bubble__capture"
          src={captureImage}
        />
      ) : null}
      <span>{message}</span>
    </div>
  );
}

SpeechBubble.propTypes = {
  captureImage: PropTypes.string,
  message: PropTypes.string.isRequired,
  mood: PropTypes.string.isRequired,
  tail: PropTypes.oneOf(["top", "right", "bottom", "left"]),
  type: PropTypes.oneOf(Object.values(BUBBLE_TYPES)),
  visible: PropTypes.bool.isRequired
};

export default SpeechBubble;
