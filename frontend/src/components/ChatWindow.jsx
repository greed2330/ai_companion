import { useState } from "react";
import PropTypes from "prop-types";
import { submitFeedback } from "../services/feedback";
import { streamChat } from "../services/chat";

function ChatWindow({ onMoodChange, onAssistantReply }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState({});

  async function handleFeedback(messageId, score) {
    if (!messageId || feedbackState[messageId]) {
      return;
    }

    try {
      await submitFeedback(messageId, score);
      setFeedbackState((prev) => ({ ...prev, [messageId]: score }));
    } catch (feedbackError) {
      setError(feedbackError.message);
    }
  }

  async function submitMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    const assistantId = `assistant-${Date.now()}`;
    let assistantContent = "";
    setError("");
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "", mood: "IDLE" }
    ]);

    try {
      await streamChat({
        message: trimmed,
        conversationId,
        onToken: (token) => {
          assistantContent += token;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: `${message.content}${token}` }
                : message
            )
          );
        },
        onDone: (event) => {
          const nextMood = event.mood || "IDLE";
          setConversationId(event.conversation_id || conversationId);
          onMoodChange(nextMood);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    id: event.message_id || message.id,
                    mood: nextMood
                  }
                : message
            )
          );
          onAssistantReply(assistantContent, nextMood);
        }
      });
    } catch (streamError) {
      setError(streamError.message);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  return (
    <section className="chat-window">
      <div className="messages" aria-label="chat-messages">
        {messages.map((message) => (
          <article key={message.id} className={`message message--${message.role}`}>
            <strong>{message.role === "user" ? "You" : "HANA"}</strong>
            <p>{message.content}</p>
            {message.role === "assistant" && message.id.startsWith("assistant-") === false ? (
              <div className="feedback-row">
                <button
                  type="button"
                  aria-label={`thumbs-up-${message.id}`}
                  onClick={() => handleFeedback(message.id, 5)}
                >
                  👍
                </button>
                <button
                  type="button"
                  aria-label={`thumbs-down-${message.id}`}
                  onClick={() => handleFeedback(message.id, 1)}
                >
                  👎
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <div className="composer">
        <input
          aria-label="message-input"
          placeholder="메시지를 입력해줘"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
        />
        <button type="button" onClick={submitMessage} disabled={isStreaming}>
          전송
        </button>
      </div>
    </section>
  );
}

ChatWindow.propTypes = {
  onMoodChange: PropTypes.func.isRequired,
  onAssistantReply: PropTypes.func.isRequired
};

export default ChatWindow;
