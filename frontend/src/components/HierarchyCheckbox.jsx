import PropTypes from "prop-types";

function HierarchyCheckbox({
  badge,
  checked,
  children,
  disabled = false,
  indeterminate = false,
  label,
  onChange
}) {
  return (
    <div className="hierarchy-checkbox">
      <label className="hierarchy-checkbox__label">
        <input
          ref={(element) => {
            if (element) {
              element.indeterminate = indeterminate;
            }
          }}
          checked={checked}
          disabled={disabled}
          type="checkbox"
          onChange={onChange}
        />
        <span>{label}</span>
        {badge ? <span className="phase-badge">{badge}</span> : null}
      </label>
      {children ? <div className="indent">{children}</div> : null}
    </div>
  );
}

HierarchyCheckbox.propTypes = {
  badge: PropTypes.string,
  checked: PropTypes.bool.isRequired,
  children: PropTypes.node,
  disabled: PropTypes.bool,
  indeterminate: PropTypes.bool,
  label: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
};

export default HierarchyCheckbox;
