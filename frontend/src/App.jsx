import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import CharacterOverlay from "./components/CharacterOverlay";
import ChatOverlay from "./components/ChatOverlay";
import Settings from "./components/Settings";
import BubbleWindow from "./components/bubble/BubbleWindow";
import useMoodStream from "./hooks/useMoodStream";
import { fetchModels } from "./services/settings";

function CharacterScreen() {
  const [mood, setMood] = useState("IDLE");
  const [models, setModels] = useState([]);
  const [currentModelId, setCurrentModelId] = useState(null);

  useEffect(() => {
    async function loadModels() {
      const payload = await fetchModels();
      setModels(payload.models || []);
      setCurrentModelId(payload.current || null);
    }

    loadModels();
  }, []);

  useMoodStream({
    onMoodChange: setMood,
    onModelChange: async (modelId) => {
      setCurrentModelId(modelId);
      const payload = await fetchModels();
      setModels(payload.models || []);
      setCurrentModelId(payload.current || modelId || null);
    }
  });

  useEffect(() => {
    const channel = new BroadcastChannel("hana-overlay");
    channel.onmessage = (event) => {
      if (event.data?.type === "character_model_selected") {
        setCurrentModelId(event.data.modelId || null);
      }
    };

    return () => channel.close();
  }, []);

  const activeModel =
    models.find((model) => model.id === currentModelId) || models[0] || null;

  return (
    <CharacterOverlay
      mood={mood}
      modelPath={activeModel?.path || ""}
      modelName={activeModel?.name || "하나"}
    />
  );
}

function ChatScreen() {
  const [mood, setMood] = useState("IDLE");

  useMoodStream({
    onMoodChange: setMood,
    onModelChange: () => {}
  });

  function handleAssistantReply(message, replyMood) {
    window.hanaDesktop?.showBubble?.({
      message,
      mood: replyMood,
      type: "talk"
    });
  }

  return (
    <ChatOverlay
      mood={mood}
      onMoodChange={setMood}
      onAssistantReply={handleAssistantReply}
    />
  );
}

function SettingsScreen() {
  return <Settings />;
}

function BubbleScreen() {
  return <BubbleWindow />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/character" replace />} />
      <Route path="/bubble" element={<BubbleScreen />} />
      <Route path="/character" element={<CharacterScreen />} />
      <Route path="/chat" element={<ChatScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/character" replace />} />
    </Routes>
  );
}

export default App;
