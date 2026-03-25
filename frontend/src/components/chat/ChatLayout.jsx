import PropTypes from "prop-types";
import ChatInput from "./ChatInput";
import ConversationSidebar from "./ConversationSidebar";
import MessagesArea from "./MessagesArea";
import MoodBar from "./MoodBar";

function ChatLayout(props) {
  const {
    groupedConversations,
    inputRef,
    messages,
    mood,
    onDeleteConversation,
    onFeedback,
    onNewConversation,
    onSelectConversation,
    onSend,
    roomType,
    selectedConversationId,
    sseConnected,
    streaming,
  } = props;

  return (
    <div className="chat-layout" data-testid="chat-layout">
      <ConversationSidebar
        groupedConversations={groupedConversations}
        onDelete={onDeleteConversation}
        onNewConversation={onNewConversation}
        onSelect={onSelectConversation}
        selectedConversationId={selectedConversationId}
      />

      <div className="chat-main">
        <MoodBar mood={mood} roomType={roomType} sseConnected={sseConnected} />
        <MessagesArea messages={messages} onFeedback={onFeedback} />
        <ChatInput inputRef={inputRef} isStreaming={streaming} onSend={onSend} />
      </div>
    </div>
  );
}

ChatLayout.propTypes = {
  groupedConversations: PropTypes.object.isRequired,
  inputRef: PropTypes.object.isRequired,
  messages: PropTypes.array.isRequired,
  mood: PropTypes.string.isRequired,
  onDeleteConversation: PropTypes.func.isRequired,
  onFeedback: PropTypes.func.isRequired,
  onNewConversation: PropTypes.func.isRequired,
  onSelectConversation: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
  roomType: PropTypes.string.isRequired,
  selectedConversationId: PropTypes.string,
  sseConnected: PropTypes.bool.isRequired,
  streaming: PropTypes.bool.isRequired,
};

export default ChatLayout;
