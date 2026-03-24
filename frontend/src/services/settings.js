import { buildApiUrl } from "./api";

async function readJson(response, message) {
  if (!response.ok) {
    throw new Error(message);
  }

  return response.json();
}

export async function fetchModels() {
  return readJson(
    await fetch(buildApiUrl("/settings/models")),
    "캐릭터 모델 목록을 불러오지 못했어."
  );
}

export async function selectModel(modelId) {
  return readJson(
    await fetch(buildApiUrl("/settings/models/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId })
    }),
    "캐릭터 모델 변경에 실패했어."
  );
}

export async function fetchLlmModels() {
  return readJson(
    await fetch(buildApiUrl("/settings/llm/models")),
    "AI 모델 목록을 불러오지 못했어."
  );
}

export async function selectLlmModel(modelId) {
  return readJson(
    await fetch(buildApiUrl("/settings/llm/select"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId })
    }),
    "AI 모델 변경에 실패했어."
  );
}

export async function fetchPersona() {
  return readJson(
    await fetch(buildApiUrl("/settings/persona")),
    "페르소나 설정을 불러오지 못했어."
  );
}

export async function savePersona(persona) {
  return readJson(
    await fetch(buildApiUrl("/settings/persona"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(persona)
    }),
    "페르소나 설정 저장에 실패했어."
  );
}

export async function previewPersona(payload) {
  return readJson(
    await fetch(buildApiUrl("/settings/persona/preview"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
    "말투 미리보기에 실패했어."
  );
}

export async function fetchAutonomous() {
  return readJson(
    await fetch(buildApiUrl("/settings/autonomous")),
    "자율 행동 설정을 불러오지 못했어."
  );
}

export async function saveAutonomous(autonomous) {
  return readJson(
    await fetch(buildApiUrl("/settings/autonomous"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(autonomous)
    }),
    "자율 행동 설정 저장에 실패했어."
  );
}
