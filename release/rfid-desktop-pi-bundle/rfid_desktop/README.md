# Maquinita RFID Desktop

Aplicación desktop nativa para Raspberry Pi 5 usando Tkinter.

## Ejecutar manualmente

```bash
cd /Users/edgarmflores/maquinita
python3 -m venv .venv-rfid-desktop
. .venv-rfid-desktop/bin/activate
pip install -r rfid_desktop/requirements.txt
python -m rfid_desktop
```

## Instalar en Raspberry Pi

```bash
cd /Users/edgarmflores/maquinita
bash scripts/install_rfid_desktop_pi.sh
```

## Autostart opcional

```bash
cd /Users/edgarmflores/maquinita
bash scripts/install_rfid_desktop_pi.sh --autostart
```
