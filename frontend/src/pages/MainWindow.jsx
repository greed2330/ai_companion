import { useEffect, useMemo, useRef, useState } from "react";
import ChatLayout from "../components/chat/ChatLayout";
import SettingsLayout from "../components/settings/SettingsLayout";
import useMoodStream from "../hooks/useMoodStream";
import useConversations from "../hooks/useConversations";
import useChat from "../hooks/useChat";

const TABS = [
  { id: "chat", label: "채팅" },
  { id: "settings", label: "설정" },
];

function MainWindow() {
  const [activeTab, setActiveTab] = useState("chat");
  const [mood, setMood] = useState("IDLE");
  const [roomType, setRoomType] = useState("일반");
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const inputRef = useRef(null);
  const {
    conversations,
    deleteConversation,
    groupedConversations,
    refreshConversations,
  } = useConversations();

  const { mode } = useMoodStream({
    onMoodChange: setMood,
    onModelChange: () => {},
    onRoomChange: (event) => {
      if (event?.room_type) {
        setRoomType(event.room_type);
      }
    },
  });

  const chat = useChat(currentConversationId, {
    onConversationCreated: (conversationId) => {
      setCurrentConversationId(conversationId);
      setSelectedConversationId(conversationId);
      refreshConversations();
    },
    onRoomChange: (nextRoomType) => setRoomType(nextRoomType || "일반"),
    onMessagePersisted: refreshConversations,
  });

  useEffect(() => {
    const unsubscribe = window.hanaDesktop?.onSetTab?.((tab) => {
      setActiveTab(tab || "chat");
    });
    return () => unsubscribe?.();
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === currentConversationId) || null,
    [conversations, currentConversationId]
  );

  return (
    <div className="main-window" data-testid="main-window">
      <div className="titlebar">
        <div className="titlebar-left">
          <div className="titlebar-dot" />
          <span className="titlebar-title">HANA COMPANION</span>
        </div>
        <div className="titlebar-controls">
          <button
            aria-label="window-minimize"
            className="ctrl-btn"
            type="button"
            onClick={() =>
              window.hanaDesktop?.windowMinimize?.() ||
              window.hanaDesktop?.minimizeWindow?.()
            }
          >
            _
          </button>
          <button
            aria-label="window-hide"
            className="ctrl-btn close"
            type="button"
            onClick={() =>
              window.hanaDesktop?.windowHide?.() || window.hanaDesktop?.closeWindow?.()
            }
          >
            ✕
          </button>
        </div>
      </div>

      <div className="tab-bar" aria-label="main tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "chat" ? (
        <ChatLayout
          activeConversation={activeConversation}
          currentConversationId={currentConversationId}
          groupedConversations={groupedConversations}
          inputRef={inputRef}
          messages={chat.messages}
          mood={mood}
          onDeleteConversation={async (conversationId) => {
            const deleted = await deleteConversation(conversationId);
            if (!deleted) {
              return;
            }

            if (
              conversationId === currentConversationId ||
              conversationId === selectedConversationId
            ) {
              setCurrentConversationId(null);
              setSelectedConversationId(null);
              setRoomType("?쇰컲");
              chat.clearMessages();
            }
          }}
          onFeedback={chat.submitFeedback}
          onInputFocus={() => inputRef.current?.focus()}
          onNewConversation={() => {
            setCurrentConversationId(null);
            setSelectedConversationId(null);
            setRoomType("일반");
            chat.clearMessages();
            inputRef.current?.focus();
          }}
          onSelectConversation={(conversationId) => {
            setCurrentConversationId(conversationId);
            setSelectedConversationId(conversationId);
          }}
          onSend={chat.sendMessage}
          refreshConversations={refreshConversations}
          roomType={roomType}
          selectedConversationId={selectedConversationId}
          sseConnected={mode === "stream"}
          streaming={chat.isStreaming}
        />
      ) : (
        <SettingsLayout />
      )}
    </div>
  );
}

export default MainWindow;
