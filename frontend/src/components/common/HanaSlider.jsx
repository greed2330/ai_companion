import PropTypes from "prop-types";

export function HanaSlider({ min, max, value, onChange, style }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      className="hana-slider"
      max={max}
      min={min}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{
        background: `linear-gradient(to right, var(--hana-accent) ${pct}%, var(--hana-surface3) ${pct}%)`,
        ...style,
      }}
      type="range"
      value={value}
    />
  );
}

HanaSlider.propTypes = {
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  style: PropTypes.object,
};

export default HanaSlider;
