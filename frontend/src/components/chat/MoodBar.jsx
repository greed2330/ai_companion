import PropTypes from "prop-types";

function MoodBar({ mood, roomType, sseConnected }) {
  return (
    <div className="mood-bar">
      <div className={`mood-dot ${sseConnected ? "connected" : "disconnected"}`} />
      <span className="mood-label">무드:</span>
      <span className="mood-val">{mood}</span>
      <div className="room-badge">{roomType}</div>
    </div>
  );
}

MoodBar.propTypes = {
  mood: PropTypes.string.isRequired,
  roomType: PropTypes.string.isRequired,
  sseConnected: PropTypes.bool.isRequired,
};

export default MoodBar;
