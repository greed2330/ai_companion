import PropTypes from "prop-types";

function formatRelativeDate(startedAt) {
  const date = new Date(startedAt);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function ConversationSidebar({
  onDelete,
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
                <button
                  aria-label={`delete-${conversation.id}`}
                  title="대화 삭제"
                  className="conv-delete-btn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(conversation.id);
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M3 3 L9 9 M9 3 L3 9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
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
  onDelete: PropTypes.func.isRequired,
  onNewConversation: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedConversationId: PropTypes.string,
};

export default ConversationSidebar;
