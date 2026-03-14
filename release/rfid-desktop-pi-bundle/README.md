# Maquinita RFID Desktop Bundle para Raspberry Pi 5

Este bundle es autocontenido. No depende del repo original una vez copiado al Raspberry Pi.

## Contenido
- `rfid_desktop/`: app desktop Tkinter
- `rfid_runtime/`: controlador compartido RFID
- `rfid_tools/`: lógica portable de protocolo y NetPort
- `install.sh`: instala venv, launcher y acceso desde menú
- `run.sh`: ejecuta la app ya instalada

## Transferir al Raspberry Pi

### Opción A: copiar la carpeta
```bash
scp -r rfid-desktop-pi-bundle pi@IP_DEL_PI:/home/pi/
```

### Opción B: copiar el tar.gz
```bash
scp rfid-desktop-pi-bundle.tar.gz pi@IP_DEL_PI:/home/pi/
```
Luego en el Pi:
```bash
cd /home/pi
mkdir -p rfid-desktop-pi-bundle
cd rfid-desktop-pi-bundle

tar -xzf ../rfid-desktop-pi-bundle.tar.gz --strip-components=1
```

## Instalar en el Raspberry Pi
```bash
cd /ruta/al/rfid-desktop-pi-bundle
bash install.sh
```

## Autostart opcional
```bash
cd /ruta/al/rfid-desktop-pi-bundle
bash install.sh --autostart
```

## Ejecutar
```bash
~/.local/bin/maquinita-rfid-desktop
```

## Dependencia del sistema
Si `tkinter` no está disponible:
```bash
sudo apt-get update && sudo apt-get install -y python3-tk
```
