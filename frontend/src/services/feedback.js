import { buildApiUrl } from "./api";

export async function submitFeedback(messageId, score) {
  const response = await fetch(buildApiUrl("/feedback"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId, score })
  });

  if (!response.ok) {
    throw new Error("피드백 저장에 실패했어.");
  }

  return response.json();
}

export async function deleteConversation(conversationId) {
  const response = await fetch(buildApiUrl(`/conversations/${conversationId}`), {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error("대화 삭제에 실패했어.");
  }

  return response.json();
}
