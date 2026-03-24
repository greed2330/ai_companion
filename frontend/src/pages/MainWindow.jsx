import { useEffect, useState } from "react";
import ChatWindow from "../components/ChatWindow";
import Settings from "../components/Settings";
import useAfkDetection from "../hooks/useAfkDetection";
import useMoodStream from "../hooks/useMoodStream";
import useSettings from "../hooks/useSettings";

const TABS = [
  { id: "chat", label: "채팅", description: "대화, 리액션, 최근 흐름을 확인해요." },
  { id: "settings", label: "설정", description: "캐릭터와 앱 동작 방식을 다듬어요." }
];

function MainWindow() {
  const [activeTab, setActiveTab] = useState("chat");
  const [mood, setMood] = useState("IDLE");
  const [currentRoom, setCurrentRoom] = useState("general");
  const [autoRoom, setAutoRoom] = useState(true);
  const [conversationSeed, setConversationSeed] = useState(0);
  const settingsState = useSettings();

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

  const aiName = settingsState.effective.persona.ai_name || "하나";
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0];

  return (
    <section className="main-window" data-testid="main-window">
      <header className="main-window__header">
        <div className="main-window__brand">
          <span className="main-window__eyebrow">HANA companion</span>
          <div>
            <strong>{aiName}</strong>
            <p>{activeTabMeta.description}</p>
          </div>
        </div>
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
            <span>{tab.label}</span>
            <small>{tab.description}</small>
          </button>
        ))}
      </nav>

      <section className="main-window__stage">
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
            settings={settingsState.effective.voice}
          />
        ) : (
          <Settings settingsState={settingsState} />
        )}
      </section>
    </section>
  );
}

export default MainWindow;
