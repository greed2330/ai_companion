import PropTypes from "prop-types";

function Settings({ isOpen }) {
  if (!isOpen) {
    return null;
  }
  return <section className="settings-panel">Settings</section>;
}

export default Settings;

Settings.propTypes = {
  isOpen: PropTypes.bool.isRequired
};
