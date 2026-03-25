import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import MessageBubble from "./MessageBubble";

function MessagesArea({ messages, onFeedback }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="messages-area">
        <div className="messages-empty">
          <div className="messages-empty-icon">🌸</div>
          <div className="messages-empty-text">새 대화를 시작해봐요</div>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-area">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id || `${message.role}-${index}`}
          message={message}
          onFeedback={onFeedback}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}

MessagesArea.propTypes = {
  messages: PropTypes.arrayOf(PropTypes.object).isRequired,
  onFeedback: PropTypes.func.isRequired,
};

export default MessagesArea;
