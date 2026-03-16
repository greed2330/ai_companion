function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.__VITE_API_BASE_URL__) {
    return window.__VITE_API_BASE_URL__;
  }
  if (typeof process !== "undefined" && process.env.VITE_API_BASE_URL) {
    return process.env.VITE_API_BASE_URL;
  }
  return "http://localhost:8000";
}

const API_BASE_URL = getApiBaseUrl();

function parseSseLine(line) {
  if (!line.startsWith("data:")) {
    return null;
  }
  return line.slice(5).trim();
}

export async function streamChat({
  message,
  conversationId,
  onToken,
  onDone
}) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? null
    })
  });

  if (!response.ok || !response.body) {
    throw new Error("채팅 스트리밍을 시작할 수 없어요.");
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
        continue;
      }
      if (event.type === "done") {
        onDone(event);
        continue;
      }
      if (event.type === "error") {
        throw new Error(event.message || "응답 중 오류가 발생했어요.");
      }
    }
  }
}
