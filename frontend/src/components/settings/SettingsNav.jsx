import PropTypes from "prop-types";

const ITEMS = [
  ["character", "캐릭터", "모델 / 뷰포트"],
  ["ai", "AI 모델", "페르소나 / LLM"],
  ["behavior", "행동", "반응 / 검색"],
  ["integrations", "연동", "API 상태"],
  ["voice", "음성", "입출력 방식"],
  ["app", "앱", "테마 / 실행"],
];

function SettingsNav({ active, onChange }) {
  return (
    <div className="sidebar">
      {ITEMS.map(([id, label, sub]) => (
        <div
          key={id}
          className={`nav-item ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
        >
          <div className="nav-label">{label}</div>
          <div className="nav-sub">{sub}</div>
        </div>
      ))}
    </div>
  );
}

SettingsNav.propTypes = {
  active: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default SettingsNav;
