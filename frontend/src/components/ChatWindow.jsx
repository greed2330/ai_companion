import { useState } from "react";
import PropTypes from "prop-types";
import { streamChat } from "../services/chat";

function ChatWindow({ onMoodChange }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");

  async function submitMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    const assistantId = `assistant-${Date.now()}`;
    setError("");
    setIsStreaming(true);
    setInput("");
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
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: `${message.content}${token}` }
                : message
            )
          );
        },
        onDone: (event) => {
          setConversationId(event.conversation_id || conversationId);
          onMoodChange(event.mood || "IDLE");
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    id: event.message_id || message.id,
                    mood: event.mood || "IDLE"
                  }
                : message
            )
          );
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
      <h1>HANA Chat</h1>
      <div className="messages" aria-label="chat-messages">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <strong>{message.role === "user" ? "You" : "HANA"}</strong>
            <p>{message.content}</p>
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

export default ChatWindow;

ChatWindow.propTypes = {
  onMoodChange: PropTypes.func.isRequired
};
