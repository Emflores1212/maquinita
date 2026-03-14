#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${RFID_DESKTOP_VENV:-$ROOT_DIR/.venv-rfid-desktop}"
AUTOSTART=0

if [[ "${1:-}" == "--autostart" ]]; then
  AUTOSTART=1
fi

if ! python3 - <<'PY' >/dev/null 2>&1
import tkinter
PY
then
  echo "tkinter no está disponible. En Raspberry Pi OS instala python3-tk:" >&2
  echo "  sudo apt-get update && sudo apt-get install -y python3-tk" >&2
  exit 1
fi

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$ROOT_DIR/rfid_desktop/requirements.txt"

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
cat > "$HOME/.local/bin/maquinita-rfid-desktop" <<SH
#!/usr/bin/env bash
set -euo pipefail
exec "$ROOT_DIR/scripts/run_rfid_desktop.sh"
SH
chmod +x "$HOME/.local/bin/maquinita-rfid-desktop"

cat > "$HOME/.local/share/applications/maquinita-rfid-desktop.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Maquinita RFID Desktop
Comment=Consola RFID desktop para Raspberry Pi 5
Exec=$HOME/.local/bin/maquinita-rfid-desktop
Terminal=false
Categories=Utility;Development;
StartupNotify=true
DESKTOP

if [[ "$AUTOSTART" -eq 1 ]]; then
  mkdir -p "$HOME/.config/autostart"
  cp "$HOME/.local/share/applications/maquinita-rfid-desktop.desktop" "$HOME/.config/autostart/maquinita-rfid-desktop.desktop"
fi

echo "Instalación completa. Ejecuta desde el icono 'Maquinita RFID Desktop' o con:"
echo "  $HOME/.local/bin/maquinita-rfid-desktop"
