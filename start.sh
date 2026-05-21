#!/bin/bash
# HANA 통합 실행 스크립트
# 사용법: ./start.sh         → Electron 앱 + 백엔드
#         ./start.sh web     → 브라우저(localhost:3000) + 백엔드

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# venv 확인
if [ ! -f ".venv/bin/uvicorn" ]; then
  echo "[ERROR] .venv가 없거나 깨져 있어. 먼저 아래를 실행해:"
  echo "  python3.11 -m venv .venv --clear"
  echo "  source .venv/bin/activate"
  echo "  pip install -r backend/requirements.txt"
  exit 1
fi

# 종료 시 자식 프로세스 전부 정리
cleanup() {
  trap - EXIT INT TERM  # 재진입 방지: kill 0 이후 EXIT 시그널로 다시 호출되는 것 막음
  echo ""
  echo "[HANA] 종료 중..."
  kill 0
  wait
}
trap cleanup EXIT INT TERM

echo "[HANA] 백엔드 시작..."
.venv/bin/uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# 백엔드 준비 대기 (최대 15초)
echo "[HANA] 백엔드 준비 대기..."
for i in $(seq 1 15); do
  if curl -s http://localhost:8000/mood > /dev/null 2>&1; then
    echo "[HANA] 백엔드 준비 완료"
    break
  fi
  sleep 1
done

echo "[HANA] 프론트엔드 시작..."
cd frontend
if [ "$1" = "web" ]; then
  # 브라우저 모드 (Electron 없이)
  npm run dev:react &
  sleep 2
  open http://localhost:3000
else
  # Electron 앱 모드
  npm run dev &
fi

echo "[HANA] 실행 중. Ctrl+C로 종료."
wait
