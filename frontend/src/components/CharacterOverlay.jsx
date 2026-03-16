import PropTypes from "prop-types";

function CharacterOverlay({ mood }) {
  return (
    <aside className="character-overlay" data-testid="character-overlay">
      <p>HANA</p>
      <p aria-label="current-mood">{mood}</p>
    </aside>
  );
}

export default CharacterOverlay;

CharacterOverlay.propTypes = {
  mood: PropTypes.string.isRequired
};
