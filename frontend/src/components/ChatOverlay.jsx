import PropTypes from "prop-types";
import ChatWindow from "./ChatWindow";

function ChatOverlay({ isVisible, onMoodChange }) {
  if (!isVisible) {
    return null;
  }
  return (
    <div className="chat-overlay" data-testid="chat-overlay">
      <ChatWindow onMoodChange={onMoodChange} />
    </div>
  );
}

export default ChatOverlay;

ChatOverlay.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onMoodChange: PropTypes.func.isRequired
};
