#!/bin/sh
# Ensure FTW PRUE B7 checkpoint + ftw CLI are ready before serving :8092.
set -eu

MODELS_DIR=/app/models
CKPT="${FTW_CHECKPOINT_PATH:-$MODELS_DIR/prue_efnetb7_ccby_checkpoint.ckpt}"
CKPT_URL="${FTW_CHECKPOINT_URL:-https://github.com/fieldsoftheworld/ftw-baselines/releases/download/v3/prue_efnet7_checkpoint.ckpt}"

mkdir -p "$MODELS_DIR"

if [ ! -s "$CKPT" ]; then
  echo "[afb-entrypoint] Downloading FTW PRUE EFNet-B7 checkpoint (~258 MB)..."
  curl -fsSL "$CKPT_URL" -o "$CKPT"
  echo "[afb-entrypoint] Checkpoint saved to $CKPT"
fi

export FTW_CHECKPOINT_PATH="$CKPT"
export FTW_INFER_MODEL="${FTW_INFER_MODEL:-FTW_PRUE_EFNET_B7}"

if command -v ftw >/dev/null 2>&1; then
  echo "[afb-entrypoint] ftw CLI ready: $(command -v ftw)"
else
  echo "[afb-entrypoint] WARNING: ftw CLI not found — AgroDetect S2 will be unavailable" >&2
fi

exec "$@"
