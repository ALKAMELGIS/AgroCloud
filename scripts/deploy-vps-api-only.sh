#!/usr/bin/env bash
# Deploy AgroCloud API-only on Hostinger VPS (Node :3001 + Python :8092 + nginx TLS).
# Frontend stays on GitHub Pages (www.eliteagrocloud.com); only api.eliteagrocloud.com hits this host.
#
# Usage (on VPS as root):
#   export DEPLOY_PATH=/opt/AgroCloud
#   curl -fsSL https://raw.githubusercontent.com/alkamelgis/AgroCloud/main/scripts/deploy-vps-api-only.sh | bash
# Or from repo checkout:
#   chmod +x scripts/deploy-vps-api-only.sh && ./scripts/deploy-vps-api-only.sh
#
# Requires: git, git-lfs, node 20+, npm, nginx, certbot, python3-venv

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/AgroCloud}"
REPO_URL="${REPO_URL:-https://github.com/alkamelgis/AgroCloud.git}"
BRANCH="${BRANCH:-main}"
NODE_SERVICE="${NODE_SERVICE:-agrocloud-node}"
NODE_PORT="${NODE_PORT:-3001}"
API_HOST="${API_HOST:-api.eliteagrocloud.com}"

log() { echo "[deploy-api] $*" >&2; }

if [[ "$(id -u)" -ne 0 ]]; then
  log "Run as root (sudo) on the VPS."
  exit 1
fi

# Stop Docker Manager stack if it holds ports 80/443 (common failure mode on Hostinger).
if command -v docker >/dev/null 2>&1; then
  if docker ps -q --filter 'publish=443' 2>/dev/null | grep -q .; then
    log "Stopping Docker containers bound to :443 (free ports for nginx)…"
    docker ps -q --filter 'publish=443' | xargs -r docker stop || true
  fi
  if docker ps -q --filter 'publish=80' 2>/dev/null | grep -q .; then
    docker ps -q --filter 'publish=80' | xargs -r docker stop || true
  fi
fi

if [[ ! -d "$DEPLOY_PATH/.git" ]]; then
  log "Cloning into $DEPLOY_PATH"
  mkdir -p "$(dirname "$DEPLOY_PATH")"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$DEPLOY_PATH"
fi

cd "$DEPLOY_PATH"
log "Pull latest $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "Install Node dependencies (backend only — no SPA build)"
npm ci --no-audit --no-fund --workspace=backend --include-workspace-root

log "Deploy agri-field-boundary (Python :8092 — AgroDetect S2 / AFD)"
AFB_DIR="$DEPLOY_PATH/backend/services/agri-field-boundary"
if [[ -f "$AFB_DIR/start-vps.sh" ]]; then
  chmod +x "$AFB_DIR/start-vps.sh"
  cp "$AFB_DIR/agri-field-boundary.service" "/etc/systemd/system/agri-field-boundary.service"
  sed -i "s|/opt/AgroCloud|${DEPLOY_PATH}|g" "/etc/systemd/system/agri-field-boundary.service" || true
  export FTW_INFER_ENABLED=1
  export AFB_GIT_PULL=0
  (cd "$AFB_DIR" && AFB_USE_SYSTEMD=1 ./start-vps.sh) || log "warning: agri-field-boundary deploy failed — map RGB builtin still works"
else
  log "warning: missing $AFB_DIR/start-vps.sh — skip Python field engine"
fi

log "Install / refresh systemd unit for Node API"
cat > "/etc/systemd/system/${NODE_SERVICE}.service" <<EOF
[Unit]
Description=AgroCloud Node API (api.eliteagrocloud.com)
After=network.target agri-field-boundary.service
Wants=agri-field-boundary.service

[Service]
Type=simple
User=root
WorkingDirectory=${DEPLOY_PATH}
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${NODE_PORT}
Environment=FIELD_BOUNDARY_URL=http://127.0.0.1:8092/detect
EnvironmentFile=-${DEPLOY_PATH}/.env.production
ExecStart=/usr/bin/npm run start -w backend
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable agri-field-boundary 2>/dev/null || true
systemctl enable "${NODE_SERVICE}"
systemctl restart agri-field-boundary 2>/dev/null || true
systemctl restart "${NODE_SERVICE}"

log "Smoke test Node /api/health"
sleep 3
curl -fsS "http://127.0.0.1:${NODE_PORT}/api/health" | grep -q '"ok"'

if [[ -f scripts/nginx-api-only.conf.example ]]; then
  log "Install / refresh nginx (api subdomain only)"
  NGINX_SITE="/etc/nginx/sites-available/${API_HOST}"
  cp scripts/nginx-api-only.conf.example "$NGINX_SITE"
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${API_HOST}"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl enable nginx 2>/dev/null || true
  systemctl restart nginx || systemctl reload nginx

  CERT_DIR="/etc/letsencrypt/live/${API_HOST}"
  if [[ ! -f "${CERT_DIR}/fullchain.pem" ]]; then
    log "Obtaining TLS cert for ${API_HOST}…"
    certbot --nginx -d "${API_HOST}" --non-interactive --agree-tos -m admin@eliteagrocloud.com || \
      log "warning: certbot failed — run manually: certbot --nginx -d ${API_HOST}"
  fi
fi

log "Smoke test field boundary proxy"
curl -fsS "http://127.0.0.1:${NODE_PORT}/api/agri-field-boundary/health" | grep -q '"status"' || \
  log "warning: field boundary health check failed (Python may still be loading weights)"

log "Deploy complete — API at https://${API_HOST}/"
