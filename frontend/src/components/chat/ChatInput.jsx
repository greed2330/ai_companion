import { useState } from "react";
import PropTypes from "prop-types";
import { sttService } from "../../services/stt";

const HINTS = [
  { label: "코드 분석", text: "코드 분석해줘" },
  { label: "오늘 일정", text: "오늘 일정 알려줘" },
  { label: "기분 어때", text: "기분 어때?" },
];

function ChatInput({ inputRef, isStreaming, onSend }) {
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  function handleInput(event) {
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 90)}px`;
    setValue(event.target.value);
  }

  function submit() {
    if (!value.trim() || isStreaming) {
      return;
    }

    onSend(value);
    setValue("");

    if (inputRef.current) {
      inputRef.current.style.height = "36px";
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  async function toggleVoice() {
    if (isRecording) {
      setIsRecording(false);
      const result = await sttService.stop();
      if (result.text.trim()) {
        onSend(result.text.trim());
      }
    } else {
      try {
        await sttService.start();
        setIsRecording(true);
      } catch {
        // 마이크 권한 거부 또는 미지원 환경 — 조용히 실패
      }
    }
  }

  return (
    <div className="chat-input-area">
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={value}
          placeholder="하나에게 말 걸어봐..."
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button
          className={`voice-btn${isRecording ? " recording" : ""}`}
          type="button"
          disabled={isStreaming}
          onClick={toggleVoice}
          title={isRecording ? "녹음 중 — 클릭해서 전송" : "음성 입력"}
        >
          🎤
        </button>
        <button className="send-btn" type="button" disabled={isStreaming} onClick={submit}>
          전송
        </button>
      </div>
      <div className="input-hints">
        {HINTS.map((hint) => (
          <button
            key={hint.label}
            className="hint-chip"
            type="button"
            onClick={() => {
              setValue(hint.text);
              inputRef.current?.focus();
            }}
          >
            {hint.label}
          </button>
        ))}
        <span className="enter-hint">Enter 전송 · Shift+Enter 줄바꿈</span>
      </div>
    </div>
  );
}

ChatInput.propTypes = {
  inputRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  isStreaming: PropTypes.bool.isRequired,
  onSend: PropTypes.func.isRequired,
};

export default ChatInput;
