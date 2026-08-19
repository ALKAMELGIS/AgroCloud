#!/usr/bin/env bash
# One-shot bootstrap for FTW live on Hostinger VPS (Ubuntu 24.04).
# Run as root from hPanel → VPS → Browser terminal:
#   curl -fsSL https://raw.githubusercontent.com/ALKAMELGIS/AgroCloud/main/scripts/vps-bootstrap-agri-field-boundary.sh | bash
#
# Or after git clone:
#   cd /opt/AgroCloud/backend/services/agri-field-boundary && AFB_GIT_PULL=1 AFB_USE_SYSTEMD=1 ./start-vps.sh

set -euo pipefail

REPO="${AGRO_REPO:-/opt/AgroCloud}"
BRANCH="${AGRO_BRANCH:-main}"
GITHUB_REPO="${GITHUB_REPO:-https://github.com/ALKAMELGIS/AgroCloud.git}"

log() { printf '[agro-ftw-bootstrap] %s\n' "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  log "Run as root (sudo -i)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl python3.12 python3.12-venv python3-pip build-essential libgdal-dev gdal-bin

if [[ ! -d "$REPO/.git" ]]; then
  log "Cloning $GITHUB_REPO → $REPO"
  git clone --depth 1 --branch "$BRANCH" "$GITHUB_REPO" "$REPO"
else
  log "Updating $REPO"
  git -C "$REPO" fetch origin "$BRANCH"
  git -C "$REPO" reset --hard "origin/$BRANCH"
fi

cd "$REPO/backend/services/agri-field-boundary"
chmod +x start-vps.sh

if [[ ! -f /etc/systemd/system/agri-field-boundary.service ]]; then
  log "Installing systemd unit"
  cp agri-field-boundary.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable agri-field-boundary
fi

export FTW_INFER_ENABLED=1
AFB_GIT_PULL=0 AFB_USE_SYSTEMD=1 ./start-vps.sh

log "Done. Verify:"
log "  curl -fsS http://127.0.0.1:8092/health/live"
log "  curl -fsS http://127.0.0.1:8092/health/ready"
log "Then on Hostinger Node API set:"
log "  FIELD_BOUNDARY_URL=http://$(curl -fsS ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):8092/detect"
