import PropTypes from "prop-types";

function SpeechBubble({ text }) {
  return <div className="speech-bubble">{text}</div>;
}

export default SpeechBubble;

SpeechBubble.propTypes = {
  text: PropTypes.string.isRequired
};
