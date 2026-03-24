import { buildApiUrl } from "./api";

export async function checkProactiveEvent(eventType) {
  const response = await fetch(buildApiUrl("/proactive/check"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType })
  });

  if (!response.ok) {
    throw new Error("능동 반응 체크에 실패했어.");
  }

  return response.json();
}

export async function postProactiveIgnored(logId) {
  if (!logId) {
    return null;
  }

  try {
    await fetch(buildApiUrl("/proactive/ignored"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log_id: logId })
    });
  } catch {
    return null;
  }

  return true;
}
