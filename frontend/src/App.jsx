import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import CharacterOverlay from "./components/CharacterOverlay";
import BubbleWindow from "./components/bubble/BubbleWindow";
import CharacterPositionPopup from "./components/settings/CharacterPositionPopup";
import useMoodStream from "./hooks/useMoodStream";
import MainWindow from "./pages/MainWindow";
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
    },
    onRoomChange: () => {}
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
      modelId={activeModel?.id || ""}
      modelName={activeModel?.name || "하나"}
      modelPath={activeModel?.path || ""}
    />
  );
}

function BubbleScreen() {
  return <BubbleWindow />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/character" replace />} />
      <Route path="/bubble" element={<BubbleScreen />} />
      <Route path="/charPosition" element={<CharacterPositionPopup />} />
      <Route path="/character" element={<CharacterScreen />} />
      <Route path="/main" element={<MainWindow />} />
      <Route path="*" element={<Navigate to="/character" replace />} />
    </Routes>
  );
}

export default App;
