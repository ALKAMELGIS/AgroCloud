#!/usr/bin/env bash
# Run on VPS as root (SSH or hPanel Browser Terminal).
set -euo pipefail
cd /opt/AgroCloud/backend/services/agri-field-boundary
chmod +x start-vps.sh
cp agri-field-boundary.service /etc/systemd/system/agri-field-boundary.service
systemctl daemon-reload
systemctl enable agri-field-boundary
systemctl restart agri-field-boundary
command -v ufw >/dev/null && ufw allow 8092/tcp && ufw reload || true
sleep 10
echo "=== systemctl ==="
systemctl status agri-field-boundary --no-pager
echo "=== ss ==="
ss -lntp | grep 8092 || true
echo "=== curl live ==="
curl -sS http://127.0.0.1:8092/health/live
echo
echo "=== curl health ==="
curl -sS http://127.0.0.1:8092/health
echo
