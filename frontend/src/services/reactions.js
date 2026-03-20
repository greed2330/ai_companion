import { streamChat } from "./chat";

export async function requestReactionBubble(prompt) {
  let content = "";
  let mood = "IDLE";

  await streamChat({
    message: prompt,
    conversationId: null,
    onToken: (token) => {
      content += token;
    },
    onDone: (event) => {
      mood = event.mood || mood;
    }
  });

  return {
    message: content.trim(),
    mood
  };
}
