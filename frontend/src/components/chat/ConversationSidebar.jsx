import PropTypes from "prop-types";

function formatRelativeDate(startedAt) {
  const date = new Date(startedAt);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function ConversationSidebar({
  groupedConversations,
  onNewConversation,
  onSelect,
  selectedConversationId,
}) {
  return (
    <aside className="chat-sidebar">
      <button className="new-chat-btn" type="button" onClick={onNewConversation}>
        <span className="new-chat-plus">+</span>
        새 대화
      </button>

      <div className="conv-list">
        {Object.entries(groupedConversations).map(([groupLabel, items]) => (
          <div key={groupLabel}>
            <div className="conv-group-title">{groupLabel}</div>
            {items.map((conversation) => (
              <div
                key={conversation.id}
                className={`conv-item ${selectedConversationId === conversation.id ? "active" : ""}`}
                onClick={() => onSelect(conversation.id)}
              >
                <div className="conv-title">{conversation.title}</div>
                <div className="conv-preview">{conversation.preview}</div>
                <div className="conv-meta">
                  <span className="conv-date">{formatRelativeDate(conversation.started_at)}</span>
                  <span className="conv-room-tag">{conversation.roomType || "일반"}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

ConversationSidebar.propTypes = {
  groupedConversations: PropTypes.object.isRequired,
  onNewConversation: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedConversationId: PropTypes.string,
};

export default ConversationSidebar;
