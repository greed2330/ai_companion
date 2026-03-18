import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import CharacterOverlay from "./components/CharacterOverlay";
import ChatOverlay from "./components/ChatOverlay";
import Settings from "./components/Settings";
import useMoodStream from "./hooks/useMoodStream";
import { fetchModels } from "./services/settings";

function CharacterScreen() {
  const [mood, setMood] = useState("IDLE");
  const [models, setModels] = useState([]);
  const [currentModelId, setCurrentModelId] = useState(null);
  const [speech, setSpeech] = useState({ message: "", visible: false });

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
      if (event.data?.type !== "bubble") {
        return;
      }

      setSpeech({ message: event.data.message || "", visible: true });
      if (event.data.mood) {
        setMood(event.data.mood);
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
      speechMessage={speech.message}
      speechVisible={speech.visible}
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
    const channel = new BroadcastChannel("hana-overlay");
    channel.postMessage({
      type: "bubble",
      message,
      mood: replyMood
    });
    channel.close();
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/character" replace />} />
      <Route path="/character" element={<CharacterScreen />} />
      <Route path="/chat" element={<ChatScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/character" replace />} />
    </Routes>
  );
}

export default App;
