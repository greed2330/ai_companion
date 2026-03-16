import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import CharacterOverlay from "./components/CharacterOverlay";
import ChatOverlay from "./components/ChatOverlay";

function App() {
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [mood, setMood] = useState("IDLE");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.altKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setIsChatVisible((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <CharacterOverlay mood={mood} />
      <Routes>
        <Route
          path="/"
          element={
            <ChatOverlay
              isVisible={isChatVisible}
              onMoodChange={setMood}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
