import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { streamChat } from "../services/chat";
import { submitFeedback } from "../services/feedback";
import { OUTPUT_MODES } from "../constants/outputModes";
import { useOutputMode } from "../hooks/useOutputMode";
import { useMotionStream } from "../hooks/useMotionStream";
import { sttService } from "../services/stt";
import "../services/lipsync";

const ROOM_CONFIG = {
  general: { label: "General", hint: "Everyday chat", interactionType: "chat" },
  coding: { label: "Coding", hint: "Debug and build", interactionType: "coding" },
  game: { label: "Game", hint: "Game reactions", interactionType: "game" },
  free: { label: "Free", hint: "Anything else", interactionType: "chat" },
};

const STARTERS = [
  "오늘 뭐부터 해야 할지 정리해줘",
  "지금 에러 원인부터 같이 보자",
  "조금 더 집중된 톤으로 바꿔줘",
];

function ChatWindow({
  autoRoom,
  currentMood,
  currentRoom,
  onAutoRoomChange,
  onMoodChange,
  onNewConversation,
  onRoomChange,
  onRoomEvent,
  settings,
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRec, setIsRec] = useState(false);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef(null);
  const { handleResponse } = useOutputMode(settings);

  useMotionStream(conversationId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function handleFeedback(messageId, score) {
    if (!messageId || feedbackState[messageId]) {
      return;
    }

    try {
      await submitFeedback(messageId, score);
      setFeedbackState((current) => ({ ...current, [messageId]: score }));
    } catch (feedbackError) {
      setError(feedbackError.message);
    }
  }

  async function submitMessage(rawInput = input, audioFeatures = null) {
    const trimmed = rawInput.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    const assistantId = `assistant-${Date.now()}`;
    const outputMode = settings.outputMode || OUTPUT_MODES.CHAT;
    const shouldRenderInChat = outputMode === OUTPUT_MODES.CHAT;
    const voiceMode = settings.inputMode === "voice" || settings.inputMode === "both";
    let assistantContent = "";

    setError("");
    setInput("");
    setIsStreaming(true);
    window.__pendingTTSParams = audioFeatures
      ? { ...(window.__pendingTTSParams || {}), audioFeatures }
      : window.__pendingTTSParams || {};

    setMessages((current) => {
      const next = [...current, { id: `user-${Date.now()}`, role: "user", content: trimmed }];
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

          setMessages((current) =>
            current.map((message) =>
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
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, id: event.message_id || message.id, mood: nextMood }
                  : message
              )
            );
          }

          await handleResponse(
            assistantContent,
            event.action_type || "",
            { mood: nextMood, ...(window.__pendingTTSParams || {}) },
            (text) => {
              if (!shouldRenderInChat) {
                setMessages((current) => [
                  ...current,
                  {
                    id: event.message_id || assistantId,
                    role: "assistant",
                    content: text,
                    mood: nextMood,
                  },
                ]);
              }
            }
          );
        },
        onRoomChange: onRoomEvent,
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

  async function handleVoice() {
    if (isRec) {
      setIsRec(false);
      const { text, audio_features: audioFeatures } = await sttService.stop();
      if (text.trim()) {
        setInput(text);
        await submitMessage(text, audioFeatures);
      }
      return;
    }

    setIsRec(true);
    await sttService.start();
  }

  function selectRoom(room) {
    onRoomChange(room);
    onAutoRoomChange(false);
    setSidebarOpen(false);
  }

  function renderRail() {
    return (
      <>
        <div className="chat-sidebar__header">
          <p className="chat-sidebar__eyebrow">Conversations</p>
          <strong>웹 AI 채팅 레이아웃</strong>
        </div>

        <button
          type="button"
          className="button button--primary chat-sidebar__new"
          onClick={() => {
            onNewConversation();
            setConversationId(null);
            setMessages([]);
            setSidebarOpen(false);
          }}
        >
          New chat
        </button>

        <div className="chat-sidebar__rooms">
          {Object.entries(ROOM_CONFIG).map(([room, config]) => (
            <button
              key={room}
              type="button"
              className={`chat-sidebar__room ${currentRoom === room ? "is-active" : ""}`}
              onClick={() => selectRoom(room)}
            >
              <strong>{config.label}</strong>
              <span>{config.hint}</span>
            </button>
          ))}
        </div>

        <div className="chat-sidebar__footer">
          <div className="chat-sidebar__status">
            <span className="mood-indicator__dot" />
            <strong>{currentMood}</strong>
          </div>
          <p>{autoRoom ? "Auto routing is enabled." : "Room is pinned manually."}</p>
        </div>
      </>
    );
  }

  return (
    <section className="chat-shell">
      {sidebarOpen ? (
        <>
          <button
            aria-label="sidebar-backdrop"
            className="chat-sidebar__backdrop"
            type="button"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="chat-sidebar--drawer" data-testid="chat-sidebar">
            {renderRail()}
          </aside>
        </>
      ) : null}

      <div className="chat-layout">
        <aside className="chat-rail">{renderRail()}</aside>

        <div className="chat-window">
          <header className="chat-window__header">
            <div className="chat-window__left">
              <button
                type="button"
                className="chat-window__menu"
                aria-label="Toggle sidebar"
                onClick={() => setSidebarOpen((open) => !open)}
              >
                ≡
              </button>
              <div className="chat-window__meta">
                <span className="chat-window__eyebrow">Room</span>
                <strong>{ROOM_CONFIG[currentRoom]?.label || ROOM_CONFIG.general.label}</strong>
                <p>{autoRoom ? "Hana can reroute from system events." : "Manual room lock is active."}</p>
              </div>
            </div>

            <div className="chat-window__chips">
              <span className="chat-chip">{settings.inputMode}</span>
              <span className="chat-chip">{settings.outputMode || OUTPUT_MODES.CHAT}</span>
              <span className="chat-chip chat-chip--mood">{currentMood}</span>
            </div>
          </header>

          <div className="messages" aria-label="chat-messages">
            {messages.length === 0 ? (
              <section className="chat-empty">
                <div className="chat-empty__hero">
                  <span className="chat-empty__eyebrow">Ready</span>
                  <h3>Hana is ready.</h3>
                  <p>레퍼런스 기반 셸 위에 실제 채팅 엔드포인트를 연결한 상태.</p>
                </div>

                <div className="starter-grid">
                  {STARTERS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="starter-card"
                      onClick={() => submitMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {messages.map((message) => (
              <article key={message.id} className={`message-row message-row--${message.role}`}>
                <div className={`message-avatar message-avatar--${message.role}`}>
                  {message.role === "user" ? "U" : "H"}
                </div>
                <div className={`message-card message-card--${message.role}`}>
                  <div className="message-card__meta">
                    <strong>{message.role === "user" ? "You" : "HANA"}</strong>
                    {message.role === "assistant" ? <span>{message.mood || currentMood}</span> : null}
                  </div>

                  <p>{message.content || (isStreaming ? "..." : "")}</p>

                  {message.role === "assistant" && !message.id.startsWith("assistant-") ? (
                    <div className="feedback-row">
                      <button
                        type="button"
                        aria-label={`thumbs-up-${message.id}`}
                        className={`feedback-chip ${feedbackState[message.id] === 5 ? "is-active" : ""}`}
                        onClick={() => handleFeedback(message.id, 5)}
                      >
                        Helpful
                      </button>
                      <button
                        type="button"
                        aria-label={`thumbs-down-${message.id}`}
                        className={`feedback-chip ${feedbackState[message.id] === 1 ? "is-active" : ""}`}
                        onClick={() => handleFeedback(message.id, 1)}
                      >
                        Off
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}

            <div ref={endRef} data-testid="messages-end" />
          </div>

          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="composer-shell">
            <div className="composer">
              <input
                aria-label="message-input"
                className="composer__input"
                placeholder="Message Hana..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />

              <button
                aria-label="voice-input"
                className={`button composer__voice ${isRec ? "is-recording" : ""}`}
                onClick={handleVoice}
                title={isRec ? "Recording. Click again to stop." : "Voice input"}
                type="button"
              >
                Mic
              </button>

              <button
                type="button"
                className="button button--primary composer__send"
                onClick={() => submitMessage()}
                disabled={isStreaming}
              >
                Send
              </button>
            </div>
          </footer>
        </div>
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
    outputMode: PropTypes.string,
  }).isRequired,
};

export { ROOM_CONFIG };
export default ChatWindow;
