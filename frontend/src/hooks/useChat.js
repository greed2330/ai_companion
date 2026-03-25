import { useEffect, useState } from "react";
import { buildApiUrl } from "../services/api";
import { submitFeedback as postFeedback } from "../services/feedback";

export default function useChat(
  conversationId,
  { onConversationCreated, onRoomChange, onMessagePersisted }
) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      if (!conversationId) {
        setMessages([]);
        return;
      }
      try {
        const response = await fetch(
          buildApiUrl(`/history?conversation_id=${conversationId}&limit=50`)
        );
        const payload = await response.json();
        setMessages(payload.messages || []);
      } catch {
        setMessages([]);
      }
    }

    loadHistory();
  }, [conversationId]);

  async function sendMessage(text) {
    if (!text.trim() || isStreaming) {
      return;
    }

    const userMessage = {
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const tempId = `streaming-${Date.now()}`;

    setMessages((prev) => [...prev, userMessage, {
      id: tempId,
      role: "assistant",
      content: "",
      streaming: true,
    }]);
    setIsStreaming(true);

    try {
      const response = await fetch(buildApiUrl("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId ?? null,
          interaction_type: null,
          voice_mode: false,
        }),
      });

      if (!response.body) {
        throw new Error("응답 스트림이 없습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }

          const raw = line.slice(6).trim();
          if (raw === "[DONE]") {
            setIsStreaming(false);
            continue;
          }

          try {
            const event = JSON.parse(raw);
            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === tempId
                    ? { ...message, content: message.content + (event.content || "") }
                    : message
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === tempId
                    ? {
                        ...message,
                        id: event.message_id,
                        streaming: false,
                        created_at: event.created_at || new Date().toISOString(),
                      }
                    : message
                )
              );
              if (!conversationId && event.conversation_id) {
                onConversationCreated?.(event.conversation_id);
              }
              onMessagePersisted?.();
              setIsStreaming(false);
            } else if (event.type === "room_change") {
              onRoomChange?.(event.room_type || "일반");
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === tempId
                    ? { ...message, content: `[오류: ${event.message}]`, streaming: false }
                    : message
                )
              );
              setIsStreaming(false);
            }
          } catch {
            continue;
          }
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === tempId
            ? { ...message, content: `[오류: ${error.message}]`, streaming: false }
            : message
        )
      );
      setIsStreaming(false);
    }
  }

  function clearMessages() {
    setMessages([]);
  }

  async function submitFeedback(messageId, score) {
    await postFeedback(messageId, score);
  }

  return {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
    submitFeedback,
  };
}
