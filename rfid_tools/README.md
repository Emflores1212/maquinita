# RFID cross-platform helper

This directory contains a portable CLI derived from the vendor SDK you received from China.

## What I found in the vendor files

- `New TCP IP configuration tools 20250724`
  - Best source for a cross-platform port.
  - Includes C# source code for the protocol, TCP transport, serial transport, NetPort UDP discovery/config parsing, and tag parsing.
  - The UI itself is Windows WinForms, but the underlying protocol logic is reusable.
- `E710 newest SDK`
  - Demo `v5.3` depends on `RFID_API_ver1.dll`.
  - That DLL is Windows-only, so it is not a clean base for macOS or Raspberry Pi.
- `资料2020`
  - Includes a Java SDK and Linux artifacts.
  - Useful as a fallback reference, but it is older and includes serial dependencies that are not ideal on macOS/ARM.

## What this port supports

- Connect to the RFID reader over `TCP`
- Connect over `serial` if `pyserial` is installed
- Read firmware version
- Read reader temperature
- Read reader identifier
- Run realtime inventory and print EPC tags
- Discover NetPort / CH9121 modules over UDP broadcast
- Read NetPort configuration
- Decode saved `.cfg` files produced by the Windows tool

## Requirements

- Python 3.10+
- For serial access only: `python3 -m pip install pyserial`

## Examples

Read firmware over TCP:

```bash
python3 /Users/edgarmflores/maquinita/rfid_tools/rfid_cli.py firmware \
  --transport tcp \
  --host 192.168.1.116 \
  --port 4001
```

Inventory tags over TCP:

```bash
python3 /Users/edgarmflores/maquinita/rfid_tools/rfid_cli.py inventory \
  --transport tcp \
  --host 192.168.1.116 \
  --port 4001 \
  --cycles 5 \
  --rounds 1
```

Inventory tags over serial:

```bash
python3 /Users/edgarmflores/maquinita/rfid_tools/rfid_cli.py inventory \
  --transport serial \
  --device /dev/ttyUSB0 \
  --baud 115200 \
  --cycles 5
```

Discover NetPort modules:

```bash
python3 /Users/edgarmflores/maquinita/rfid_tools/rfid_cli.py net-scan \
  --bind-ip 192.168.1.10
```

Read NetPort config:

```bash
python3 /Users/edgarmflores/maquinita/rfid_tools/rfid_cli.py net-get \
  --bind-ip 192.168.1.10 \
  --device-mac 54:10:EC:12:34:56
```

Decode a `.cfg` file from the Windows app:

```bash
python3 /Users/edgarmflores/maquinita/rfid_tools/rfid_cli.py cfg-decode \
  --file /path/to/NetPortConfigure.cfg
```

## Raspberry Pi 5 notes

- `TCP` mode is the cleanest option for Raspberry Pi 5.
- `serial` mode should also work if the reader exposes UART or USB serial and `pyserial` is installed.
- The Windows demo UI itself was not ported. This tool focuses on practical operations you can use now from Terminal.

## Limitations

- I did not port the Windows GUI.
- I did not port the newer E710 `RFID_API_ver1.dll` stack because the SDK package uses a Windows-only binary.
- Read/write/lock/kill tag commands are not exposed yet in this CLI, although the old C# SDK contains the command formats.
- NetPort write/reset/default commands were intentionally left out to avoid bricking or misconfiguring the board before hardware validation.
