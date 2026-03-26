import PropTypes from "prop-types";
import { OUTPUT_MODES } from "../../../constants/outputModes";
import PhaseTag from "../../common/PhaseTag";

const OPTIONS = [
  { value: OUTPUT_MODES.CHAT, label: "채팅창", desc: "메인 창에 텍스트 표시" },
  { value: OUTPUT_MODES.BUBBLE, label: "말풍선", desc: "캐릭터 옆 말풍선 표시" },
  { value: OUTPUT_MODES.VOICE, label: "음성", desc: "TTS만 재생", phase: "4.5" },
  {
    value: OUTPUT_MODES.BUBBLE_VOICE,
    label: "말풍선 + 음성",
    desc: "말풍선과 음성을 동시에",
    phase: "4.5",
  },
];

function VoicePanel({ settings }) {
  const { current, updatePending } = settings;

  return (
    <>
      <div className="panel-section">
        <div className="panel-title">
          입력 방식 <PhaseTag>Phase 4.5</PhaseTag>
        </div>
        <select className="hana-select disabled-select" disabled>
          <option>텍스트</option>
        </select>
        <p className="voice-warning">Phase 4.5 이후 활성화됩니다</p>
      </div>

      <div className="panel-section">
        <div className="panel-title">출력 방식</div>
        <div className="output-options">
          {OPTIONS.map((option) => (
            <div
              key={option.value}
              className={`output-opt ${current.outputMode === option.value ? "active" : ""}`}
              onClick={() => updatePending("outputMode", option.value)}
            >
              <div className="output-opt-radio" />
              <div className="output-opt-text">
                <div className="output-opt-label">
                  {option.label}
                  {option.phase ? <PhaseTag>{option.phase}</PhaseTag> : null}
                </div>
                <div className="output-opt-desc">{option.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

VoicePanel.propTypes = {
  settings: PropTypes.object.isRequired,
};

export default VoicePanel;
