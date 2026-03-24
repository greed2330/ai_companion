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
  general: { label: "일반 대화", icon: "🗨", interactionType: "general" },
  coding: { label: "코딩", icon: "💻", interactionType: "coding" },
  game: { label: "게임", icon: "🎮", interactionType: "game" },
  free: { label: "자유", icon: "✦", interactionType: "free" }
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
  const [isRec, setIsRec] = useState(false);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef(null);
  const { handleResponse } = useOutputMode(settings);

  useMotionStream(conversationId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
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
            window.__pendingTTSParams || {},
            (text) => {
              if (!shouldRenderInChat) {
                setMessages((current) => [
                  ...current,
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

  function handleRoomSelect(room) {
    onRoomChange(room);
    onAutoRoomChange(false);
    setSidebarOpen(false);
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
          <aside className="chat-sidebar" data-testid="chat-sidebar">
            <div className="chat-sidebar__header">
              <p>대화 모드</p>
              <strong>상황에 맞는 컨텍스트로 빠르게 전환해요.</strong>
            </div>
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
                  <span className="chat-sidebar__icon">{config.icon}</span>
                  <span>{config.label}</span>
                </button>
              ))}
            </div>
            <div className="chat-sidebar__history">
              대화 기록 연결 UI는 다음 단계에서 이어집니다.
            </div>
          </aside>
        </>
      ) : null}

      <div className="chat-window">
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
            <span>{autoRoom ? "자동 전환이 켜져 있어요." : "수동으로 방을 고정한 상태예요."}</span>
          </div>
          <div className="mood-indicator">
            <span className="mood-indicator__dot" />
            <span>{currentMood}</span>
          </div>
        </div>

        <div className="messages" aria-label="chat-messages">
          {messages.length === 0 ? (
            <article className="chat-empty">
              <h3>하나가 기다리고 있어요.</h3>
              <p>코딩, 게임, 잡담 중 지금 필요한 흐름으로 바로 대화를 시작하면 됩니다.</p>
            </article>
          ) : null}

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
            placeholder="메시지를 입력해 주세요."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <button
            aria-label="voice-input"
            className={`composer__voice ${isRec ? "is-recording" : ""}`}
            onClick={handleVoice}
            title={isRec ? "녹음 중이에요. 다시 누르면 종료돼요." : "음성 입력"}
            type="button"
          >
            🎙
          </button>
          <button
            type="button"
            className="composer__send"
            onClick={() => submitMessage()}
            disabled={isStreaming}
          >
            전송
          </button>
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
    outputMode: PropTypes.string
  }).isRequired
};

export { ROOM_CONFIG };
export default ChatWindow;
