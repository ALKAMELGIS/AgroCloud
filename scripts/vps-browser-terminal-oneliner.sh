# Paste this entire block into Hostinger hPanel → VPS → Browser terminal (as root)

set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl python3.12 python3.12-venv python3-pip build-essential libgdal-dev gdal-bin
systemctl enable --now ssh 2>/dev/null || true
REPO=/opt/AgroCloud
if [ ! -d "$REPO/.git" ]; then git clone --depth 1 https://github.com/ALKAMELGIS/AgroCloud.git "$REPO"; else git -C "$REPO" pull --ff-only; fi
cd "$REPO/backend/services/agri-field-boundary"
chmod +x start-vps.sh
cp agri-field-boundary.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable agri-field-boundary
export FTW_INFER_ENABLED=1
AFB_USE_SYSTEMD=1 ./start-vps.sh
echo "--- live ---"
curl -sS http://127.0.0.1:8092/health/live
echo
echo "--- ready ---"
curl -sS http://127.0.0.1:8092/health/ready
echo
