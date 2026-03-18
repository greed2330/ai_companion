import { buildApiUrl } from "./api";

export async function fetchModels() {
  const response = await fetch(buildApiUrl("/settings/models"));
  if (!response.ok) {
    throw new Error("캐릭터 모델 목록을 불러오지 못했어.");
  }

  return response.json();
}

export async function selectModel(modelId) {
  const response = await fetch(buildApiUrl("/settings/models/select"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId })
  });

  if (!response.ok) {
    throw new Error("캐릭터 모델 변경에 실패했어.");
  }

  return response.json();
}

export async function fetchLlmModels() {
  const response = await fetch(buildApiUrl("/settings/llm/models"));
  if (!response.ok) {
    throw new Error("AI 모델 목록을 불러오지 못했어.");
  }

  return response.json();
}

export async function selectLlmModel(modelId) {
  const response = await fetch(buildApiUrl("/settings/llm/select"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId })
  });

  if (!response.ok) {
    throw new Error("AI 모델 변경에 실패했어.");
  }

  return response.json();
}
