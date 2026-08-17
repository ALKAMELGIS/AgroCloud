#!/usr/bin/env bash
# Deploy / run agri-field-boundary on a Hostinger VPS (or any Linux host).
#
# Does:
#   - optional git pull (AFB_GIT_PULL=1)
#   - create/update Python venv + pip install -r requirements.txt
#   - wait for /health/live then /health/ready
#   - restart via systemd when AFB_USE_SYSTEMD=1, else foreground uvicorn loop
#
# Usage (first time on VPS):
#   cd /opt/AgroCloud/backend/services/agri-field-boundary
#   chmod +x start-vps.sh
#   sudo cp agri-field-boundary.service /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now agri-field-boundary
#
# Manual / CI deploy:
#   AFB_GIT_PULL=1 AFB_USE_SYSTEMD=1 ./start-vps.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

PORT="${PORT:-8092}"
HOST="${HOST:-0.0.0.0}"
VENV_DIR="${AFB_VENV:-$HERE/.venv312}"
PY="${VENV_DIR}/bin/python"
PIP="${VENV_DIR}/bin/pip"
UVICORN="${VENV_DIR}/bin/uvicorn"
SERVICE_NAME="${AFB_SYSTEMD_UNIT:-agri-field-boundary}"
GIT_PULL="${AFB_GIT_PULL:-0}"
USE_SYSTEMD="${AFB_USE_SYSTEMD:-0}"
READY_TIMEOUT_S="${AFB_READY_TIMEOUT_S:-900}"
LIVE_TIMEOUT_S="${AFB_LIVE_TIMEOUT_S:-120}"

log() { printf '[afb-vps] %s\n' "$*" >&2; }

if [[ "$GIT_PULL" == "1" ]]; then
  REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
  if [[ -d "$REPO_ROOT/.git" ]]; then
    log "git pull in $REPO_ROOT"
    git -C "$REPO_ROOT" pull --ff-only origin "${AFB_GIT_BRANCH:-main}" || git -C "$REPO_ROOT" pull --ff-only
  else
    log "skip git pull — no .git at $REPO_ROOT"
  fi
fi

if [[ ! -x "$PY" ]]; then
  log "creating venv at $VENV_DIR"
  python3.12 -m venv "$VENV_DIR" 2>/dev/null || python3 -m venv "$VENV_DIR"
fi

log "installing dependencies"
"$PIP" install -q --upgrade pip wheel
"$PIP" install -q -r requirements.txt
"$PIP" install -q "fastapi>=0.110" "uvicorn[standard]>=0.29" "python-multipart>=0.0.9"

export FTW_INFER_ENABLED="${FTW_INFER_ENABLED:-1}"

wait_http() {
  local url="$1"
  local timeout="$2"
  local label="$3"
  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$label OK — $url"
      return 0
    fi
    if (( $(date +%s) - start >= timeout )); then
      log "timeout waiting for $label ($url)"
      return 1
    fi
    sleep 2
  done
}

if [[ "$USE_SYSTEMD" == "1" ]]; then
  if command -v systemctl >/dev/null 2>&1; then
    log "restarting systemd unit $SERVICE_NAME"
    sudo systemctl daemon-reload || true
    sudo systemctl restart "$SERVICE_NAME"
    sudo systemctl enable "$SERVICE_NAME" || true
  else
    log "systemctl not found — falling back to foreground uvicorn"
    USE_SYSTEMD=0
  fi
fi

if [[ "$USE_SYSTEMD" == "1" ]]; then
  wait_http "http://127.0.0.1:${PORT}/health/live" "$LIVE_TIMEOUT_S" "live" || exit 1
  wait_http "http://127.0.0.1:${PORT}/health/ready" "$READY_TIMEOUT_S" "ready" || {
    log "ready probe timed out — service may still be loading weights; check journalctl -u $SERVICE_NAME"
    exit 1
  }
  log "agri-field-boundary is live + ready on :$PORT"
  exit 0
fi

if curl -fsS "http://127.0.0.1:${PORT}/health/live" >/dev/null 2>&1; then
  log "already healthy on :$PORT — leaving existing process"
  exit 0
fi

log "starting uvicorn on ${HOST}:${PORT}"
while true; do
  "$UVICORN" app:app --host "$HOST" --port "$PORT" || true
  if curl -fsS "http://127.0.0.1:${PORT}/health/live" >/dev/null 2>&1; then
    log "another process claimed :$PORT — exiting restart loop"
    exit 0
  fi
  log "uvicorn exited — restarting in 2s"
  sleep 2
done
