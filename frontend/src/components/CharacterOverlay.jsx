import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  applyGaze,
  applyMood,
  applyViewportTransform,
  detectModelType,
  loadCharacterModel,
} from "./characterRenderer";
import {
  createPettingTracker,
  getClickZone,
  getGazeOffset,
  ZONE_REACTIONS,
} from "./character/interactionUtils";
import { requestReactionBubble } from "../services/reactions";
import { characterController } from "../services/characterController";

function CharacterOverlay({ mood, modelId = "", modelPath = "", modelName = "하나" }) {
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef(null);
  const pettingTracker = useMemo(
    () =>
      createPettingTracker(() => {
        window.hanaDesktop?.showBubble?.({
          message: "기분 좋다~",
          mood: "HAPPY",
          type: "talk",
        });
      }),
    []
  );

  const [hasRenderableModel, setHasRenderableModel] = useState(false);
  const [menuState, setMenuState] = useState({ open: false, x: 0, y: 0 });
  const [viewport, setViewport] = useState({
    positionX: 50,
    positionY: 50,
    scale: 1,
    opacity: 1,
  });
  const [pinned, setPinned] = useState(false);

  function syncViewport(target = rendererRef.current, nextViewport = viewport) {
    if (typeof applyViewportTransform === "function") {
      applyViewportTransform(target, nextViewport);
      return;
    }

    target?.applyViewport?.(nextViewport);
  }

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
          async (relativePath) => window.hanaDesktop?.resolveAssetUrl?.(relativePath) || ""
        );
        rendererRef.current = instance;
        if (instance) {
          await characterController.init(instance, modelId);
          syncViewport(instance, viewport);
        }
        setHasRenderableModel(Boolean(instance));
      } catch {
        rendererRef.current?.cleanup?.();
        characterController.detach();
        rendererRef.current = null;
        setHasRenderableModel(false);
      }
    }

    rendererRef.current?.cleanup?.();
    characterController.detach();
    rendererRef.current = null;
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    mountModel();

    return () => {
      characterController.detach();
      rendererRef.current?.cleanup?.();
      rendererRef.current = null;
    };
  }, [modelId, modelPath]);

  useEffect(() => {
    applyMood(rendererRef.current, mood);
  }, [mood]);

  useEffect(() => {
    syncViewport(rendererRef.current, viewport);
  }, [viewport]);

  useEffect(() => {
    window.hanaDesktop?.getCharacterState?.().then((state) => {
      setPinned(Boolean(state?.pinned));
    });
  }, []);

  useEffect(() => {
    async function loadViewportSettings() {
      const appSettings = await window.hanaDesktop?.getAppSettings?.();
      const character = appSettings?.character || {};
      setViewport((current) => ({
        ...current,
        positionX: Number(character.positionX ?? 50),
        positionY: Number(character.positionY ?? 50),
        scale: Number(character.viewportScale ?? 100) / 100,
        opacity: Number(character.opacity ?? 100) / 100,
      }));
    }

    loadViewportSettings();

    const channel = new BroadcastChannel("hana-overlay");
    channel.onmessage = (event) => {
      if (event.data?.type !== "character_settings_updated") {
        return;
      }

      const character = event.data.character || {};
      setViewport((current) => {
        const nextViewport = {
          ...current,
          positionX: Number(character.positionX ?? current.positionX),
          positionY: Number(character.positionY ?? current.positionY),
          scale: Number(character.viewportScale ?? current.scale * 100) / 100,
        };
        syncViewport(rendererRef.current, nextViewport);
        return nextViewport;
      });
    };

    const unsubscribe = window.hanaDesktop?.onCharacterSettingsUpdated?.((character) => {
      setViewport((current) => {
        const nextViewport = {
          ...current,
          positionX: Number(character?.positionX ?? current.positionX),
          positionY: Number(character?.positionY ?? current.positionY),
          scale: Number(character?.viewportScale ?? current.scale * 100) / 100,
        };
        syncViewport(rendererRef.current, nextViewport);
        return nextViewport;
      });
    });

    return () => {
      channel.close();
      unsubscribe?.();
    };
  }, []);

  function closeMenu() {
    setMenuState((current) => ({ ...current, open: false }));
  }

  async function triggerZoneReaction(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const zone = getClickZone(event.clientY - bounds.top, bounds.height);
    const reaction = ZONE_REACTIONS[zone];

    try {
      const bubble = await requestReactionBubble(reaction.prompt);
      window.hanaDesktop?.showBubble?.({
        message: bubble.message || reaction.emoji,
        mood: bubble.mood || reaction.mood,
        type: "talk",
      });
    } catch {
      window.hanaDesktop?.showBubble?.({
        message: reaction.emoji,
        mood: reaction.mood,
        type: "talk",
      });
    }
  }

  function handleMouseDown(event) {
    closeMenu();
    if (event.button === 0 || event.button === 2) {
      if (event.button === 2) {
        window.hanaDesktop?.startCharacterDrag?.();
      }
      dragRef.current = {
        button: event.button,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
      };
    }
  }

  function handleMouseMove(event) {
    const currentDrag = dragRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    const zone = getClickZone(event.clientY - bounds.top, bounds.height);
    pettingTracker.update({ movementX: event.movementX, zone });

    window.hanaDesktop?.getCharacterBounds?.().then((charBounds) => {
      const gaze = getGazeOffset(
        event.screenX,
        event.screenY,
        charBounds || {
          x: 0,
          y: 0,
          width: bounds.width,
          height: bounds.height,
        }
      );
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

    if (currentDrag.button === 2) {
      window.hanaDesktop?.moveCharacterBy?.(
        event.screenX - currentDrag.screenX,
        event.screenY - currentDrag.screenY
      );
      currentDrag.screenX = event.screenX;
      currentDrag.screenY = event.screenY;
    }

  }

  function handleMouseUp(event) {
    const currentDrag = dragRef.current;
    dragRef.current = null;
    if (!currentDrag) {
      return;
    }

    if (currentDrag.button === 2) {
      window.hanaDesktop?.finishCharacterDrag?.();
      window.hanaDesktop?.endCharacterDrag?.();
      if (!currentDrag.moved) {
        setMenuState({ open: true, x: event.clientX, y: event.clientY });
      }
    }

    if (currentDrag.button === 0 && !currentDrag.moved) {
      triggerZoneReaction(event);
    }
  }

  async function handleTogglePin() {
    const state = await window.hanaDesktop?.toggleCharacterPinned?.();
    setPinned(Boolean(state?.pinned));
    closeMenu();
  }

  return (
    <section
      ref={stageRef}
      className="character-stage"
      data-testid="character-overlay"
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => window.hanaDesktop?.notifyCharacterMouse?.(true)}
      onMouseLeave={() => {
        if (dragRef.current?.button === 2) {
          return;
        }
        dragRef.current = null;
        pettingTracker.reset();
        window.hanaDesktop?.notifyCharacterMouse?.(false);
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="character-viewport">
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
        <div className="character-menu" style={{ left: menuState.x, top: menuState.y }}>
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
  mood: PropTypes.string.isRequired,
  modelId: PropTypes.string,
  modelPath: PropTypes.string,
  modelName: PropTypes.string,
};

export { detectModelType, getClickZone, createPettingTracker };
export default CharacterOverlay;
