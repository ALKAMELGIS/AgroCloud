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
  log "Install nginx site (if not present)"
  NGINX_SITE="/etc/nginx/sites-available/eliteagrocloud.com"
  if [[ ! -f "$NGINX_SITE" ]]; then
    cp scripts/nginx-eliteagrocloud-vps.conf.example "$NGINX_SITE"
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/eliteagrocloud.com
    nginx -t
    systemctl reload nginx
    log "Run certbot if TLS not configured: certbot --nginx -d eliteagrocloud.com -d www.eliteagrocloud.com"
  fi
fi

log "Deploy complete — https://www.eliteagrocloud.com/ (after DNS points to this VPS)"
