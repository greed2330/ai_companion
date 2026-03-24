import { useEffect, useState } from "react";
import ChatWindow from "../components/ChatWindow";
import Settings from "../components/Settings";
import useAfkDetection from "../hooks/useAfkDetection";
import useMoodStream from "../hooks/useMoodStream";

const TABS = [
  { id: "chat", label: "채팅" },
  { id: "settings", label: "설정" }
];

function MainWindow() {
  const [activeTab, setActiveTab] = useState("chat");
  const [mood, setMood] = useState("IDLE");
  const [currentRoom, setCurrentRoom] = useState("general");
  const [autoRoom, setAutoRoom] = useState(true);
  const [conversationSeed, setConversationSeed] = useState(0);
  const [settings] = useState({ inputMode: "text" });

  function handleRoomChangeEvent(event) {
    if (autoRoom && event?.room_type) {
      setCurrentRoom(event.room_type);
    }

    if (event?.message) {
      window.hanaDesktop?.showBubble?.({
        message: event.message,
        mood: "CURIOUS",
        type: "alert"
      });
    }
  }

  useMoodStream({
    onMoodChange: setMood,
    onModelChange: () => {},
    onRoomChange: handleRoomChangeEvent
  });

  useAfkDetection({ setMood });

  useEffect(() => {
    const unsubscribe = window.hanaDesktop?.onSetTab?.((tab) => {
      setActiveTab(tab || "chat");
    });

    return () => unsubscribe?.();
  }, []);

  return (
    <section className="main-window" data-testid="main-window">
      <header className="main-window__header">
        <strong>하나</strong>
        <div className="window-controls">
          <button
            type="button"
            className="window-control-button"
            aria-label="Minimize window"
            onClick={() => window.hanaDesktop?.minimizeWindow?.()}
          >
            _
          </button>
          <button
            type="button"
            className="window-control-button window-control-button--danger"
            aria-label="Close window"
            onClick={() => window.hanaDesktop?.closeWindow?.()}
          >
            X
          </button>
        </div>
      </header>

      <nav className="main-window__tabs" aria-label="main tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`main-window__tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="main-window__content">
        {activeTab === "chat" ? (
          <ChatWindow
            autoRoom={autoRoom}
            currentMood={mood}
            currentRoom={currentRoom}
            key={conversationSeed}
            onAutoRoomChange={setAutoRoom}
            onMoodChange={setMood}
            onNewConversation={() => {
              setConversationSeed((current) => current + 1);
              setCurrentRoom("general");
              setAutoRoom(true);
            }}
            onRoomChange={setCurrentRoom}
            onRoomEvent={handleRoomChangeEvent}
            settings={settings}
          />
        ) : (
          <Settings />
        )}
      </div>
    </section>
  );
}

export default MainWindow;
