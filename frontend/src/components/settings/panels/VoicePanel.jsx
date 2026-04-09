import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { OUTPUT_MODES } from "../../../constants/outputModes";
import PhaseTag from "../../common/PhaseTag";
import { useVoice } from "../../../hooks/useVoice";

const OUTPUT_OPTIONS = [
  { value: OUTPUT_MODES.CHAT,         label: "채팅창",     desc: "메인 창에 텍스트 표시" },
  { value: OUTPUT_MODES.BUBBLE,       label: "말풍선",     desc: "캐릭터 옆 말풍선 표시" },
  { value: OUTPUT_MODES.VOICE,        label: "음성",       desc: "TTS만 재생",            phase: "4.5" },
  { value: OUTPUT_MODES.BUBBLE_VOICE, label: "말풍선+음성", desc: "말풍선과 음성을 동시에", phase: "4.5" },
];

const VOICE_OUTPUT_MODES = new Set([OUTPUT_MODES.VOICE, OUTPUT_MODES.BUBBLE_VOICE]);

function EngineCard({ engine, isActive, onSelect }) {
  const unavailable = !engine.available;
  return (
    <div
      className={`engine-card${isActive ? " engine-card--active" : ""}${unavailable ? " engine-card--unavailable" : ""}`}
      onClick={() => !unavailable && onSelect(engine.engine_id)}
      title={unavailable ? "서버 미실행" : engine.description}
    >
      <div className="engine-card__name">{engine.name}</div>
      <div className="engine-card__desc">{engine.description}</div>
      <div className={`engine-card__status ${engine.available ? "engine-card__status--ok" : "engine-card__status--fail"}`}>
        {engine.available ? "● 사용 가능" : "○ 서버 미실행"}
      </div>
    </div>
  );
}

EngineCard.propTypes = {
  engine: PropTypes.object.isRequired,
  isActive: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

function PreviewButton({ voiceId, previewState, onPreview }) {
  const isThis = previewState.voiceId === voiceId;
  const status = isThis ? previewState.status : "idle";

  const label =
    status === "loading" ? "· · ·" :
    status === "playing" ? "■ 정지" :
    status === "error"   ? "✕ 실패" :
    "▶ 미리듣기";

  return (
    <button
      className={`voice-preview-btn${status === "playing" ? " voice-preview-btn--playing" : ""}${status === "error" ? " voice-preview-btn--error" : ""}`}
      onClick={() => onPreview(voiceId)}
      disabled={status === "loading"}
    >
      {label}
    </button>
  );
}

PreviewButton.propTypes = {
  voiceId: PropTypes.string.isRequired,
  previewState: PropTypes.object.isRequired,
  onPreview: PropTypes.func.isRequired,
};

function UploadArea({ onUpload, onCancel }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const ALLOWED = new Set(["audio/wav", "audio/mpeg", "audio/mp3"]);

  function handleFile(f) {
    if (!ALLOWED.has(f.type)) {
      setError("WAV 또는 MP3 파일만 지원해.");
      return;
    }
    setError("");
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  async function handleSubmit() {
    if (!file || !name.trim()) { setError("파일과 이름을 입력해줘."); return; }
    setUploading(true);
    setError("");
    try {
      await onUpload(file, name.trim());
    } catch (e) {
      setError(e.message || "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="voice-upload">
      <div
        className={`voice-upload__dropzone${dragging ? " voice-upload__dropzone--over" : ""}${file ? " voice-upload__dropzone--has-file" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        {file ? <span>{file.name}</span> : <span>WAV 또는 MP3 파일을 드래그하거나 클릭<br/><small>권장: 3~30초 명확한 목소리 샘플</small></span>}
      </div>
      <input ref={inputRef} type="file" accept="audio/wav,audio/mpeg,audio/mp3" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
      <input
        className="hana-input"
        placeholder="목소리 이름 (예: 하나 v1)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p className="voice-upload__error">{error}</p>}
      <div className="voice-upload__actions">
        <button className="button" onClick={onCancel}>취소</button>
        <button className="button button--accent" onClick={handleSubmit} disabled={uploading || !file}>
          {uploading ? "업로드 중..." : "추가하기"}
        </button>
      </div>
    </div>
  );
}

UploadArea.propTypes = {
  onUpload: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

function VoicePanel({ settings }) {
  const { current, updatePending } = settings;
  const voice = useVoice();

  const isVoiceMode = VOICE_OUTPUT_MODES.has(current.outputMode);
  const currentEngine = voice.engines.find((e) => e.engine_id === voice.currentEngineId);
  const supportsCustom = currentEngine?.supports_custom_voice ?? false;

  return (
    <>
      {/* 입력 방식 */}
      <div className="panel-section">
        <div className="panel-title">
          입력 방식 <PhaseTag>Phase 4.5</PhaseTag>
        </div>
        <select className="hana-select" disabled>
          <option>텍스트</option>
        </select>
        <p className="settings-note">Phase 4.5 이후 활성화됩니다</p>
      </div>

      {/* 출력 방식 */}
      <div className="panel-section">
        <div className="panel-title">출력 방식</div>
        <div className="output-options">
          {OUTPUT_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className={`output-opt${current.outputMode === opt.value ? " active" : ""}`}
              onClick={() => updatePending("outputMode", opt.value)}
            >
              <div className="output-opt-radio" />
              <div className="output-opt-text">
                <div className="output-opt-label">
                  {opt.label}
                  {opt.phase ? <PhaseTag>{opt.phase}</PhaseTag> : null}
                </div>
                <div className="output-opt-desc">{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 음성 출력 모드일 때만 엔진/목소리 설정 표시 */}
      {isVoiceMode && (
        <>
          {/* TTS 엔진 선택 */}
          <div className="panel-section">
            <div className="panel-title">TTS 엔진</div>
            <div className="engine-cards">
              {voice.engines.length === 0 ? (
                <p className="settings-note">백엔드 연결 중...</p>
              ) : (
                voice.engines.map((engine) => (
                  <EngineCard
                    key={engine.engine_id}
                    engine={engine}
                    isActive={voice.currentEngineId === engine.engine_id}
                    onSelect={voice.selectEngine}
                  />
                ))
              )}
            </div>
          </div>

          {/* 목소리 목록 */}
          <div className="panel-section">
            <div className="panel-title">목소리</div>
            <div className="voice-list">
              {voice.voices.length === 0 ? (
                <p className="settings-note">목소리 목록 없음</p>
              ) : (
                voice.voices.map((v) => (
                  <div
                    key={v.voice_id}
                    className={`voice-row${voice.currentVoiceId === v.voice_id ? " voice-row--active" : ""}`}
                    onClick={() => voice.selectVoice(v.voice_id)}
                  >
                    <div className="voice-row__info">
                      <span className="voice-row__name">{v.name}</span>
                      <span className="voice-row__id">{v.voice_id}</span>
                    </div>
                    <PreviewButton
                      voiceId={v.voice_id}
                      previewState={voice.previewState}
                      onPreview={voice.previewVoice}
                    />
                    {v.is_custom && (
                      <button
                        className="voice-row__delete"
                        onClick={(e) => { e.stopPropagation(); voice.deleteVoice(v.voice_id); }}
                        title="삭제"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {supportsCustom && !voice.uploadOpen && (
              <button
                className="button voice-upload__trigger"
                onClick={() => voice.setUploadOpen(true)}
              >
                + 목소리 추가
              </button>
            )}

            {voice.uploadOpen && (
              <UploadArea
                onUpload={voice.uploadVoice}
                onCancel={() => voice.setUploadOpen(false)}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

VoicePanel.propTypes = {
  settings: PropTypes.object.isRequired,
};

export default VoicePanel;
