import PropTypes from "prop-types";

export function Badge({ tone, children }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}

Badge.propTypes = {
  tone: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export default Badge;
