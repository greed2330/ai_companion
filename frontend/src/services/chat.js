import { buildApiUrl } from "./api";

function parseSseLine(line) {
  if (!line.startsWith("data:")) {
    return null;
  }

  return line.slice(5).trim();
}

export async function streamChat({
  message,
  conversationId,
  interactionType,
  voiceMode = false,
  onToken,
  onDone,
  onRoomChange
}) {
  const response = await fetch(buildApiUrl("/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? null,
      interaction_type: interactionType ?? null,
      voice_mode: voiceMode
    })
  });

  if (!response.ok || !response.body) {
    throw new Error("채팅 스트림을 시작할 수 없어요.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const payload = parseSseLine(line);
      if (!payload) {
        continue;
      }

      if (payload === "[DONE]") {
        return;
      }

      const event = JSON.parse(payload);
      if (event.type === "token") {
        onToken(event.content || "");
      }

      if (event.type === "done") {
        onDone(event);
      }

      if (event.type === "room_change") {
        onRoomChange?.(event);
      }

      if (event.type === "error") {
        throw new Error(event.message || "응답을 받는 중 오류가 발생했어요.");
      }
    }
  }
}
