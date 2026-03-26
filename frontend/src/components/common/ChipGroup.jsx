import PropTypes from "prop-types";

export function ChipGroup({ options, labels, value, onChange }) {
  return (
    <div className="preset-chips">
      {options.map((option, index) => (
        <div
          key={option}
          className={`chip ${value === option ? "active" : ""}`}
          onClick={() => onChange(option)}
        >
          {labels ? labels[index] : option}
        </div>
      ))}
    </div>
  );
}

ChipGroup.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  labels: PropTypes.arrayOf(PropTypes.string),
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default ChipGroup;
