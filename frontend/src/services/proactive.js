import { buildApiUrl } from "./api";

export async function postProactiveIgnored() {
  try {
    await fetch(buildApiUrl("/proactive/ignored"), {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return null;
  }

  return true;
}
