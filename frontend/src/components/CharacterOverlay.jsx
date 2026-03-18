import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import SpeechBubble from "./SpeechBubble";
import { applyMood, detectModelType, loadCharacterModel } from "./characterRenderer";

function CharacterOverlay({
  mood,
  modelPath = "",
  modelName = "하나",
  speechMessage = "",
  speechVisible = false
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const [hasRenderableModel, setHasRenderableModel] = useState(false);

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
        applyMood(instance, mood);
      } catch (error) {
        console.error(error);
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

  return (
    <section className="character-stage" data-testid="character-overlay">
      <SpeechBubble message={speechMessage} mood={mood} visible={speechVisible} />
      <div className="character-canvas" ref={containerRef} />
      {!hasRenderableModel ? (
        <div className="character-placeholder">
          <div className="character-placeholder__avatar" />
          <strong>{modelName || "하나"}</strong>
        </div>
      ) : null}
    </section>
  );
}

CharacterOverlay.propTypes = {
  mood: PropTypes.string.isRequired,
  modelPath: PropTypes.string,
  modelName: PropTypes.string,
  speechMessage: PropTypes.string,
  speechVisible: PropTypes.bool
};

export { detectModelType };
export default CharacterOverlay;
