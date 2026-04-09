import PropTypes from "prop-types";

export function Toggle({ on, onChange, disabled = false }) {
  return (
    <label
      className={`toggle ${on ? "on" : ""}`}
      style={disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
      onClick={() => !disabled && onChange(!on)}
    >
      <input checked={on} disabled={disabled} readOnly type="checkbox" />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  );
}

Toggle.propTypes = {
  on: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default Toggle;
