import PropTypes from "prop-types";

export function PhaseTag({ children }) {
  return <span className="phase-badge">{children}</span>;
}

PhaseTag.propTypes = {
  children: PropTypes.node.isRequired,
};

export default PhaseTag;
