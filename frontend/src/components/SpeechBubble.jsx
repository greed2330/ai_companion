import { useEffect, useState } from "react";
import PropTypes from "prop-types";

export const BUBBLE_COLORS = {
  IDLE: "#444444",
  HAPPY: "#f5c842",
  CONCERNED: "#e05252",
  FOCUSED: "#4287f5",
  CURIOUS: "#9b42f5",
  GAMING: "#42f554"
};

function SpeechBubble({ message, mood, visible }) {
  const [isShown, setIsShown] = useState(visible);

  useEffect(() => {
    if (!visible || !message) {
      setIsShown(false);
      return undefined;
    }

    setIsShown(true);
    const timer = window.setTimeout(() => setIsShown(false), 4000);
    return () => window.clearTimeout(timer);
  }, [message, visible]);

  if (!isShown || !message) {
    return null;
  }

  return (
    <div
      className="speech-bubble"
      data-testid="speech-bubble"
      style={{ backgroundColor: BUBBLE_COLORS[mood] || BUBBLE_COLORS.IDLE }}
    >
      {message}
    </div>
  );
}

SpeechBubble.propTypes = {
  message: PropTypes.string.isRequired,
  mood: PropTypes.string.isRequired,
  visible: PropTypes.bool.isRequired
};

export default SpeechBubble;
