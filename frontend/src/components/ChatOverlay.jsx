import PropTypes from "prop-types";
import ChatWindow from "./ChatWindow";

const MOOD_INDICATORS = {
  IDLE: "Idle",
  HAPPY: "Happy",
  CONCERNED: "Concerned",
  FOCUSED: "Focused",
  CURIOUS: "Curious",
  GAMING: "Gaming"
};

function ChatOverlay({ mood, onMoodChange, onAssistantReply }) {
  function handleMinimize() {
    window.hanaDesktop?.minimizeWindow?.();
  }

  function handleMaximizeToggle() {
    window.hanaDesktop?.toggleMaximizeWindow?.();
  }

  function handleClose() {
    window.hanaDesktop?.closeWindow?.();
  }

  return (
    <section className="chat-overlay" data-testid="chat-overlay">
      <header className="chat-overlay__header">
        <div className="window-title">
          <strong>HANA</strong>
          <p>Overlay chat window</p>
        </div>
        <div className="window-toolbar">
          <span className="mood-indicator">
            {MOOD_INDICATORS[mood] || MOOD_INDICATORS.IDLE}
          </span>
          <div className="window-controls">
            <button
              type="button"
              className="window-control-button"
              aria-label="Minimize window"
              onClick={handleMinimize}
            >
              _
            </button>
            <button
              type="button"
              className="window-control-button"
              aria-label="Maximize window"
              onClick={handleMaximizeToggle}
            >
              []
            </button>
            <button
              type="button"
              className="window-control-button window-control-button--danger"
              aria-label="Close window"
              onClick={handleClose}
            >
              X
            </button>
          </div>
        </div>
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
