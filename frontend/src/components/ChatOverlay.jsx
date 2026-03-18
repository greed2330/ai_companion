import PropTypes from "prop-types";
import ChatWindow from "./ChatWindow";

const MOOD_INDICATORS = {
  IDLE: "🙂 IDLE",
  HAPPY: "✨ HAPPY",
  CONCERNED: "⚠️ CONCERNED",
  FOCUSED: "🧠 FOCUSED",
  CURIOUS: "👀 CURIOUS",
  GAMING: "🎮 GAMING"
};

function ChatOverlay({ mood, onMoodChange, onAssistantReply }) {
  return (
    <section className="chat-overlay" data-testid="chat-overlay">
      <header className="chat-overlay__header">
        <div>
          <strong>HANA</strong>
          <p>항상 위 채팅 오버레이</p>
        </div>
        <span className="mood-indicator">
          {MOOD_INDICATORS[mood] || MOOD_INDICATORS.IDLE}
        </span>
      </header>
      <ChatWindow
        onMoodChange={onMoodChange}
        onAssistantReply={onAssistantReply}
      />
    </section>
  );
}

ChatOverlay.propTypes = {
  mood: PropTypes.string.isRequired,
  onMoodChange: PropTypes.func.isRequired,
  onAssistantReply: PropTypes.func.isRequired
};

export default ChatOverlay;
