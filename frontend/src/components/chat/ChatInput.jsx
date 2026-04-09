import { useState } from "react";
import PropTypes from "prop-types";
import PhaseTag from "../common/PhaseTag";

const HINTS = [
  { label: "코드 분석", text: "코드 분석해줘" },
  { label: "오늘 일정", text: "오늘 일정 알려줘" },
  { label: "기분 어때", text: "기분 어때?" },
];

function ChatInput({ inputRef, isStreaming, onSend }) {
  const [value, setValue] = useState("");

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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
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
        <button className="voice-btn" disabled type="button">
          🎤
          <PhaseTag>4.5</PhaseTag>
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
