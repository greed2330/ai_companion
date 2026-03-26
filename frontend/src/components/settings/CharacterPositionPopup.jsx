import { useEffect, useState } from "react";

const SIZES = ["S", "M", "L", "XL"];
const SNAP_POINTS = [
  [20, 20], [50, 20], [80, 20],
  [20, 50], [50, 50], [80, 50],
  [20, 80], [50, 80], [80, 80],
];

function CharacterPositionPopup() {
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [size, setSize] = useState("M");

  useEffect(() => {
    async function loadState() {
      const [appSettings, placement] = await Promise.all([
        window.hanaDesktop?.getAppSettings?.(),
        window.hanaDesktop?.getCharacterWindowPlacement?.(),
      ]);

      const character = appSettings?.character || {};
      setX(Math.max(0, Math.min(100, Number(character.positionX ?? 50))));
      setY(Math.max(0, Math.min(100, Number(character.positionY ?? 50))));
      setSize(placement?.size || "M");
    }

    loadState();
  }, []);

  async function handleApply() {
    await window.hanaDesktop?.charPositionApply?.({ x, y, size });
    window.hanaDesktop?.closeWindow?.();
  }

  return (
    <div className="char-window">
      <div className="titlebar">
        <div className="titlebar-left">
          <div className="titlebar-dot" />
          <span className="titlebar-title">캐릭터 위치 조정</span>
        </div>
        <div className="titlebar-controls">
          <button className="ctrl-btn close" type="button" onClick={() => window.hanaDesktop?.closeWindow?.()}>
            ✕
          </button>
        </div>
      </div>

      <div className="char-preview-area">
        <div className="char-preview-grid" />
        <div className="char-preview-figure" style={{ left: `${x}%`, top: `${y}%` }}>
          <div className="char-fig-head" />
          <div className="char-fig-body" />
        </div>
        <div className="char-preview-anchor" style={{ left: `${x}%`, top: `${y}%` }} />
        <div className="char-preview-label">얼굴 위치 기준: {x}% / {y}%</div>
      </div>

      <div className="char-controls">
        <div className="panel-title">빠른 위치</div>
        <div className="snap-grid">
          {SNAP_POINTS.map(([px, py]) => (
            <button
              key={`${px}-${py}`}
              className={`snap-btn ${x === px && y === py ? "active" : ""}`}
              type="button"
              onClick={() => {
              setX(px);
              setY(py);
              }}
            >
              <span className="snap-dot" />
            </button>
          ))}
        </div>

        <div className="panel-title">뷰포트 내부 오프셋</div>
        <div className="char-ctrl-row">
          <div className="char-ctrl-label">X</div>
          <input className="hana-slider" type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} />
          <span className="slider-val">{x}%</span>
        </div>
        <div className="char-ctrl-row">
          <div className="char-ctrl-label">Y</div>
          <input className="hana-slider" type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} />
          <span className="slider-val">{y}%</span>
        </div>
        <div className="setting-desc">Y 값을 낮추면 캐릭터가 위로 올라가서 얼굴이 더 보인다.</div>

        <div className="panel-title">창 크기 프리셋</div>
        <div className="char-size-row">
          {SIZES.map((item) => (
            <button
              key={item}
              className={`size-preset ${size === item ? "active" : ""}`}
              type="button"
              onClick={() => setSize(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="btn-row">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setX(50);
              setY(50);
              setSize("M");
            }}
          >
            기본값
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={handleApply}>
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

export default CharacterPositionPopup;
