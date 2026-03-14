#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${RFID_DESKTOP_VENV:-$ROOT_DIR/.venv-rfid-desktop}"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "Desktop venv no encontrado en $VENV_DIR" >&2
  echo "Corre primero: bash $ROOT_DIR/install.sh" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec "$VENV_DIR/bin/python" -m rfid_desktop
