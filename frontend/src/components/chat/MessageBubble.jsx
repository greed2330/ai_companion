import PropTypes from "prop-types";

function formatTime(dateValue) {
  const date = new Date(dateValue);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

export function MessageBubble({ message, onFeedback }) {
  const isHana = message.role === "assistant";

  return (
    <div className={`msg-row ${isHana ? "hana" : "user"}`}>
      <div className={`msg-avatar ${isHana ? "hana" : ""}`}>{isHana ? "🌸" : "👤"}</div>
      <div className="msg-content">
        <div className="msg-bubble">
          {message.content}
          {message.streaming ? <span className="streaming-cursor" /> : null}
        </div>
        {message.created_at ? <div className="msg-time">{formatTime(message.created_at)}</div> : null}
        {isHana && message.id && !message.streaming ? (
          <div className="msg-feedback">
            <button className="fb-btn" type="button" onClick={() => onFeedback(message.id, 5)}>
              👍
            </button>
            <button className="fb-btn" type="button" onClick={() => onFeedback(message.id, 1)}>
              👎
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

MessageBubble.propTypes = {
  message: PropTypes.object.isRequired,
  onFeedback: PropTypes.func.isRequired,
};

export default MessageBubble;
