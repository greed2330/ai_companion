export const SNAP = 40;

export const TIPS = [
  "우클릭 드래그로 위치를 옮길 수 있어요",
  "Ctrl+스크롤로 크기를 조절해요",
  "스크롤 버튼 드래그로 화면을 이동해요",
  "우클릭하면 메뉴가 열려요",
  "Alt+H로 채팅/설정 창을 열 수 있어요",
  "설정에서 호칭/말투를 바꿀 수 있어요",
  "음성으로도 대화할 수 있어요"
];

export function getClickZone(clickY, height) {
  const ratio = clickY / Math.max(height, 1);
  if (ratio < 0.2) {
    return "head";
  }

  if (ratio < 0.65) {
    return "upper";
  }

  return "lower";
}

export function snapToEdge(x, y, winW, winH, sw, sh) {
  return {
    x: x < SNAP ? 0 : x + winW > sw - SNAP ? sw - winW : x,
    y: y < SNAP ? 0 : y + winH > sh - SNAP ? sh - winH : y
  };
}

export function createPettingTracker(onPetting) {
  let lastDirection = null;
  let switchCount = 0;

  return {
    reset() {
      lastDirection = null;
      switchCount = 0;
    },
    update({ movementX, zone }) {
      if (zone !== "head") {
        this.reset();
        return false;
      }

      if (Math.abs(movementX) < 3) {
        return false;
      }

      const direction = movementX > 0 ? "right" : "left";
      if (direction === lastDirection) {
        return false;
      }

      lastDirection = direction;
      switchCount += 1;
      if (switchCount < 6) {
        return false;
      }

      switchCount = 0;
      onPetting?.();
      return true;
    }
  };
}

export function getGazeOffset(mouseX, mouseY, charBounds) {
  const cx = charBounds.x + charBounds.width / 2;
  const cy = charBounds.y + charBounds.height / 3;
  const dx = mouseX - cx;
  const dy = mouseY - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > 200) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.max(-1, Math.min(1, dx / 200)),
    y: Math.max(-1, Math.min(1, dy / 200))
  };
}
