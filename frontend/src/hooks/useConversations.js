import { useCallback, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../services/api";

export function groupByDate(conversations) {
  const now = new Date();
  const groups = { 오늘: [], 어제: [], "지난 7일": [], "더 이전": [] };

  conversations.forEach((conversation) => {
    const startedAt = new Date(conversation.started_at);
    const diffDays = Math.floor((now - startedAt) / 86400000);
    if (diffDays === 0) {
      groups["오늘"].push(conversation);
    } else if (diffDays === 1) {
      groups["어제"].push(conversation);
    } else if (diffDays <= 7) {
      groups["지난 7일"].push(conversation);
    } else {
      groups["더 이전"].push(conversation);
    }
  });

  return groups;
}

function derivePreview(conversation) {
  const title = (conversation.first_user_message || conversation.session_summary || "새 대화").slice(0, 20);
  const preview = (conversation.last_message_content || conversation.session_summary || "").slice(0, 36);
  return {
    ...conversation,
    title,
    preview,
    roomType: conversation.room_type || "일반",
  };
}

export default function useConversations() {
  const [conversations, setConversations] = useState([]);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/conversations?limit=50"));
      if (!response.ok) {
        setConversations([]);
        return;
      }
      const payload = await response.json();
      setConversations((payload.conversations || []).map(derivePreview));
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const groupedConversations = useMemo(
    () => groupByDate(conversations),
    [conversations]
  );

  return {
    conversations,
    groupedConversations,
    refreshConversations,
  };
}
