#!/usr/bin/env bash
# Deploy AgroCloud full-stack on Hostinger VPS (Node + SPA + nginx).
# Run on the VPS as root or deploy user with sudo.
#
# Usage (on VPS):
#   export DEPLOY_PATH=/opt/AgroCloud
#   curl -fsSL https://raw.githubusercontent.com/OWNER/AgroCloud/main/scripts/deploy-vps-fullstack.sh | bash
# Or from repo checkout:
#   chmod +x scripts/deploy-vps-fullstack.sh && ./scripts/deploy-vps-fullstack.sh
#
# Requires: git, node 20+, npm, nginx, certbot (optional first run)

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/AgroCloud}"
REPO_URL="${REPO_URL:-https://github.com/alkamelgis/AgroCloud.git}"
BRANCH="${BRANCH:-main}"
NODE_SERVICE="${NODE_SERVICE:-agrocloud-node}"
NODE_PORT="${NODE_PORT:-3001}"

log() { echo "[deploy-vps] $*"; }

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

log "Install dependencies"
npm ci --no-audit --no-fund

log "Build SPA for same-origin API (VPS unified domain)"
export NODE_ENV=production
export ENABLE_PWA=true
export VITE_BASE_PATH='/'
export VITE_APP_CANONICAL_URL='https://www.eliteagrocloud.com/'
export VITE_ELITE_SAME_ORIGIN_API=true
export VITE_AGRI_API_SECRETS_URL=''
npm run build:production

if [[ ! -f frontend/dist/index.html ]]; then
  echo "Build failed: missing frontend/dist/index.html" >&2
  exit 1
fi

log "Deploy agri-field-boundary (Python :8092 — FTW Inference S2 / AFD)"
AFB_DIR="$DEPLOY_PATH/backend/services/agri-field-boundary"
if [[ -f "$AFB_DIR/start-vps.sh" ]]; then
  chmod +x "$AFB_DIR/start-vps.sh"
  cp "$AFB_DIR/agri-field-boundary.service" "/etc/systemd/system/agri-field-boundary.service"
  sed -i "s|/opt/AgroCloud|${DEPLOY_PATH}|g" "/etc/systemd/system/agri-field-boundary.service" || true
  export FTW_INFER_ENABLED=1
  (cd "$AFB_DIR" && AFB_USE_SYSTEMD=1 ./start-vps.sh) || log "warning: agri-field-boundary deploy failed — Map RGB builtin still works"
else
  log "warning: missing $AFB_DIR/start-vps.sh — skip Python field engine"
fi

log "Install / refresh systemd unit for Node"
cat > "/etc/systemd/system/${NODE_SERVICE}.service" <<EOF
[Unit]
Description=AgroCloud Node (SPA + API)
After=network.target

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
systemctl enable "${NODE_SERVICE}"
systemctl restart "${NODE_SERVICE}"

log "Smoke test Node /api/health"
sleep 2
curl -fsS "http://127.0.0.1:${NODE_PORT}/api/health" | grep -q '"ok"'

if [[ -f scripts/nginx-eliteagrocloud-vps.conf.example ]]; then
  log "Install / refresh nginx site"
  NGINX_SITE="/etc/nginx/sites-available/eliteagrocloud.com"
  cp scripts/nginx-eliteagrocloud-vps.conf.example "$NGINX_SITE"
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/eliteagrocloud.com
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl reload nginx
  if [[ ! -f /etc/letsencrypt/live/eliteagrocloud.com/fullchain.pem ]]; then
    log "Run certbot: certbot --nginx -d eliteagrocloud.com -d www.eliteagrocloud.com -d api.eliteagrocloud.com"
  fi
fi

log "Smoke test field boundary proxy"
curl -fsS "http://127.0.0.1:${NODE_PORT}/api/agri-field-boundary/health" | grep -q '"status"' || log "warning: field boundary health check failed"

log "Deploy complete — https://www.eliteagrocloud.com/ (after DNS points to this VPS)"
