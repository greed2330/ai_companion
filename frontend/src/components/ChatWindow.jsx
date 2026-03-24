import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { streamChat } from "../services/chat";
import { submitFeedback } from "../services/feedback";
import { OUTPUT_MODES } from "../constants/outputModes";
import { useOutputMode } from "../hooks/useOutputMode";

const ROOM_CONFIG = {
  general: { label: "일반 대화", icon: "🗨", interactionType: "general" },
  coding: { label: "코딩", icon: "💻", interactionType: "coding" },
  game: { label: "게임", icon: "🎮", interactionType: "game" },
  free: { label: "자유", icon: "", interactionType: "free" }
};

function ChatWindow({
  autoRoom,
  currentMood,
  currentRoom,
  onAutoRoomChange,
  onMoodChange,
  onNewConversation,
  onRoomChange,
  onRoomEvent,
  settings
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef(null);
  const { handleResponse } = useOutputMode(settings);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    const outputMode = settings.outputMode || OUTPUT_MODES.CHAT;
    const shouldRenderInChat = outputMode === OUTPUT_MODES.CHAT;
    const voiceMode =
      settings.inputMode === "voice" || settings.inputMode === "both";
    let assistantContent = "";

    setError("");
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => {
      const next = [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed }
      ];

      if (shouldRenderInChat) {
        next.push({ id: assistantId, role: "assistant", content: "", mood: "IDLE" });
      }

      return next;
    });

    try {
      await streamChat({
        message: trimmed,
        conversationId,
        interactionType: ROOM_CONFIG[currentRoom]?.interactionType,
        voiceMode,
        onToken: (token) => {
          assistantContent += token;

          if (!shouldRenderInChat) {
            return;
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: `${message.content}${token}` }
                : message
            )
          );
        },
        onDone: async (event) => {
          const nextMood = event.mood || "IDLE";
          setConversationId(event.conversation_id || conversationId);
          onMoodChange(nextMood);

          if (shouldRenderInChat) {
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
          }

          await handleResponse(
            assistantContent,
            event.action_type || "",
            window.__pendingTTSParams || {},
            (text) => {
              if (!shouldRenderInChat) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: event.message_id || assistantId,
                    role: "assistant",
                    content: text,
                    mood: nextMood
                  }
                ]);
              }
            }
          );
        },
        onRoomChange: onRoomEvent
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

  function handleRoomSelect(room) {
    onRoomChange(room);
    onAutoRoomChange(false);
    setSidebarOpen(false);
  }

  return (
    <section className="chat-window">
      {sidebarOpen ? (
        <>
          <button
            aria-label="sidebar-backdrop"
            className="chat-sidebar__backdrop"
            type="button"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="chat-sidebar" data-testid="chat-sidebar">
            <button
              type="button"
              className="chat-sidebar__new"
              onClick={() => {
                onNewConversation();
                setConversationId(null);
                setMessages([]);
                setSidebarOpen(false);
              }}
            >
              + 새 대화
            </button>
            <div className="chat-sidebar__rooms">
              {Object.entries(ROOM_CONFIG).map(([room, config]) => (
                <button
                  key={room}
                  type="button"
                  className={`chat-sidebar__room ${currentRoom === room ? "is-active" : ""}`}
                  onClick={() => handleRoomSelect(room)}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                </button>
              ))}
            </div>
            <div className="chat-sidebar__history">대화 기록은 다음 단계에서 연결돼.</div>
          </aside>
        </>
      ) : null}

      <div className="chat-window__toolbar">
        <button
          type="button"
          className="chat-window__menu"
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          ☰
        </button>
        <div className="chat-window__meta">
          <strong>{ROOM_CONFIG[currentRoom]?.label || ROOM_CONFIG.general.label}</strong>
          <span>{autoRoom ? "자동 전환" : "수동 고정"}</span>
        </div>
        <span className="mood-indicator">{currentMood}</span>
      </div>

      <div className="messages" aria-label="chat-messages">
        {messages.map((message) => (
          <article key={message.id} className={`message message--${message.role}`}>
            <strong>{message.role === "user" ? "You" : "HANA"}</strong>
            <p>{message.content}</p>
            {message.role === "assistant" && !message.id.startsWith("assistant-") ? (
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
        <div ref={endRef} data-testid="messages-end" />
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
        <button
          disabled
          title="음성 입력 (Phase 4.5)"
          type="button"
          style={{ cursor: "not-allowed", opacity: 0.4 }}
        >
          🎙
        </button>
        <button type="button" onClick={submitMessage} disabled={isStreaming}>
          전송
        </button>
      </div>
    </section>
  );
}

ChatWindow.propTypes = {
  autoRoom: PropTypes.bool.isRequired,
  currentMood: PropTypes.string.isRequired,
  currentRoom: PropTypes.string.isRequired,
  onAutoRoomChange: PropTypes.func.isRequired,
  onMoodChange: PropTypes.func.isRequired,
  onNewConversation: PropTypes.func.isRequired,
  onRoomChange: PropTypes.func.isRequired,
  onRoomEvent: PropTypes.func.isRequired,
  settings: PropTypes.shape({
    inputMode: PropTypes.string.isRequired,
    outputMode: PropTypes.string
  }).isRequired
};

export { ROOM_CONFIG };
export default ChatWindow;
