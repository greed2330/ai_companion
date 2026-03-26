import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  applyGaze,
  applyMood,
  detectModelType,
  loadCharacterModel
} from "./characterRenderer";
import {
  getGazeOffset,
  TIPS
} from "./character/interactionUtils";

function CharacterOverlay({ mood, modelPath = "", modelName = "하나", initialScale = 1 }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef(null);
  const prevInitialScaleRef = useRef(initialScale);
  const [hasRenderableModel, setHasRenderableModel] = useState(false);
  const [menuState, setMenuState] = useState({ open: false, x: 0, y: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: initialScale });
  const [pinned, setPinned] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    async function mountModel() {
      const container = containerRef.current;
      if (!container || !modelPath || !detectModelType(modelPath)) {
        setHasRenderableModel(false);
        return;
      }

      try {
        const instance = await loadCharacterModel(
          container,
          modelPath,
          async (relativePath) =>
            window.hanaDesktop?.resolveAssetUrl?.(relativePath) || ""
        );
        rendererRef.current = instance;
        setHasRenderableModel(Boolean(instance));
      } catch (error) {
        rendererRef.current?.cleanup?.();
        rendererRef.current = null;
        setHasRenderableModel(false);
      }
    }

    rendererRef.current?.cleanup?.();
    rendererRef.current = null;
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    mountModel();

    return () => {
      rendererRef.current?.cleanup?.();
      rendererRef.current = null;
    };
  }, [modelPath]);

  useEffect(() => {
    applyMood(rendererRef.current, mood);
  }, [mood]);

  useEffect(() => {
    window.hanaDesktop?.getCharacterState?.().then((state) => {
      setPinned(Boolean(state?.pinned));
    });
  }, []);

  // Apply scale from settings when it changes (e.g. after user confirms settings)
  useEffect(() => {
    if (initialScale !== prevInitialScaleRef.current) {
      prevInitialScaleRef.current = initialScale;
      setViewport((current) => ({ ...current, scale: initialScale }));
    }
  }, [initialScale]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % TIPS.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  function closeMenu() {
    setMenuState((current) => ({ ...current, open: false }));
  }

  function handleMouseDown(event) {
    closeMenu();
    if (event.button === 0 || event.button === 1) {
      dragRef.current = {
        button: event.button,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY
      };
    } else if (event.button === 2) {
      // Right-click: use document-level listeners so mouseleave on the overlay
      // window doesn't break the drag when the window itself moves
      dragRef.current = {
        button: 2,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY
      };
      window.hanaDesktop?.startCharacterDrag?.();

      const onMove = (e) => {
        const cur = dragRef.current;
        if (!cur || cur.button !== 2) {
          return;
        }
        const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
        if (dist > 5) {
          cur.moved = true;
        }
        window.hanaDesktop?.moveCharacterBy?.(
          e.screenX - cur.screenX,
          e.screenY - cur.screenY
        );
        cur.screenX = e.screenX;
        cur.screenY = e.screenY;
      };

      const onUp = (e) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const cur = dragRef.current;
        if (!cur || cur.button !== 2) {
          return;
        }
        dragRef.current = null;
        window.hanaDesktop?.finishCharacterDrag?.();
        window.hanaDesktop?.endCharacterDrag?.();
        if (!cur.moved) {
          setMenuState({ open: true, x: e.clientX, y: e.clientY });
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }
  }

  function handleMouseMove(event) {
    const currentDrag = dragRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();

    window.hanaDesktop?.getCharacterBounds?.().then((charBounds) => {
      const gaze = getGazeOffset(event.screenX, event.screenY, charBounds || {
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height
      });
      applyGaze(rendererRef.current, gaze.x, gaze.y);
    });

    if (!currentDrag) {
      return;
    }

    const moveDistance = Math.hypot(
      event.clientX - currentDrag.startX,
      event.clientY - currentDrag.startY
    );
    if (moveDistance > 5) {
      currentDrag.moved = true;
    }

    // Button 2 (window drag) is handled by document-level listener in handleMouseDown
    if (currentDrag.button === 1) {
      setViewport((current) => ({
        ...current,
        x: current.x + event.movementX,
        y: current.y + event.movementY
      }));
    }
  }

  function handleMouseUp(event) {
    const currentDrag = dragRef.current;
    // Button 2 drag is fully managed by the document-level onUp added in handleMouseDown
    if (!currentDrag || currentDrag.button === 2) {
      return;
    }
    dragRef.current = null;
  }

  function handleWheel(event) {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    setViewport((current) => ({
      ...current,
      scale: Math.max(0.6, Math.min(1.8, current.scale - event.deltaY * 0.001))
    }));
  }

  async function handleTogglePin() {
    const state = await window.hanaDesktop?.toggleCharacterPinned?.();
    setPinned(Boolean(state?.pinned));
    closeMenu();
  }

  return (
    <section
      className="character-stage"
      data-testid="character-overlay"
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => window.hanaDesktop?.notifyCharacterMouse?.(true)}
      onMouseLeave={() => {
        // Do not clear drag state or disable mouse events while window-dragging (button 2)
        // — the window is moving so the cursor naturally leaves the overlay bounds
        if (dragRef.current?.button !== 2) {
          dragRef.current = null;
          window.hanaDesktop?.notifyCharacterMouse?.(false);
        }
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      <div className="character-tip" data-testid="character-tip">
        {TIPS[tipIndex]}
      </div>
      <div
        className="character-viewport"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
        }}
      >
        <div className="character-figure">
          <div className="character-canvas" ref={containerRef} />
          {!hasRenderableModel ? (
            <div className="character-placeholder">
              <div className="character-placeholder__avatar" />
              <strong>{modelName || "하나"}</strong>
            </div>
          ) : null}
        </div>
      </div>
      {menuState.open ? (
        <div
          className="character-menu"
          style={{ left: menuState.x, top: menuState.y }}
        >
          <button type="button" onClick={() => window.hanaDesktop?.showChatWindow?.()}>
            채팅 열기
          </button>
          <button type="button" onClick={() => window.hanaDesktop?.showSettingsWindow?.()}>
            설정 열기
          </button>
          <button type="button" onClick={handleTogglePin}>
            위치 고정 {pinned ? "해제" : "켜기"}
          </button>
          <button type="button" onClick={() => window.hanaDesktop?.quitApp?.()}>
            종료
          </button>
        </div>
      ) : null}
    </section>
  );
}

CharacterOverlay.propTypes = {
  initialScale: PropTypes.number,
  mood: PropTypes.string.isRequired,
  modelPath: PropTypes.string,
  modelName: PropTypes.string
};

export { detectModelType };
export default CharacterOverlay;
