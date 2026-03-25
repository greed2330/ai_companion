import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import PhaseTag from "./PhaseTag";

export function HierarchyCheckbox({
  label,
  checked,
  onChange,
  disabled,
  badge,
  warning,
  children,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = checked === "indeterminate";
    }
  }, [checked]);

  return (
    <div className="hierarchy-checkbox">
      <label className={`hierarchy-label ${disabled ? "is-disabled" : ""}`}>
        <input
          checked={checked === "checked"}
          disabled={disabled}
          onChange={() => !disabled && onChange(checked === "checked" ? "unchecked" : "checked")}
          ref={ref}
          type="checkbox"
        />
        <span>{label}</span>
        {badge ? <PhaseTag>{badge}</PhaseTag> : null}
      </label>
      {warning ? <span className="hierarchy-warning">{warning}</span> : null}
      {children ? <div className="hierarchy-children">{children}</div> : null}
    </div>
  );
}

HierarchyCheckbox.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.oneOf(["checked", "unchecked", "indeterminate"]).isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  badge: PropTypes.string,
  warning: PropTypes.string,
  children: PropTypes.node,
};

export default HierarchyCheckbox;
