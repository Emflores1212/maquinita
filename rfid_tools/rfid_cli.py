#!/usr/bin/env python3
"""Cross-platform RFID helper derived from the vendor's Windows SDK.

Supports:
- TCP or serial reader access for common read-only operations.
- Real-time inventory with EPC parsing.
- NetPort discovery/get/decode for the CH9121-based TCP module config protocol.

The protocol and field layouts were ported from the vendor C# sources shipped in:
- New TCP IP configuration tools 20250724/UHFDemo_v4.2_EN_SRC
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Optional

try:
    import serial  # type: ignore
    from serial.tools import list_ports  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    serial = None
    list_ports = None

SERIAL_AVAILABLE = serial is not None


ERROR_CODES = {
    0x10: "Command succeeded",
    0x11: "Command failed",
    0x20: "CPU reset error",
    0x21: "Turn on CW error",
    0x22: "Antenna is missing",
    0x23: "Write flash error",
    0x24: "Read flash error",
    0x25: "Set output power error",
    0x31: "Error occurred during inventory",
    0x32: "Error occurred during read",
    0x33: "Error occurred during write",
    0x34: "Error occurred during lock",
    0x35: "Error occurred during kill",
    0x36: "There is no tag to be operated",
    0x37: "Tag inventoried but access failed",
    0x38: "Buffer is empty",
    0x40: "Access failed or wrong password",
    0x41: "Invalid parameter",
    0x42: "WordCnt is too long",
    0x43: "MemBank out of range",
    0x44: "Lock region out of range",
    0x45: "LockType out of range",
    0x46: "Invalid reader address",
    0x47: "AntennaID out of range",
    0x48: "Output power out of range",
    0x49: "Frequency region out of range",
    0x4A: "Baud rate out of range",
    0x4B: "Buzzer behavior out of range",
    0x4C: "EPC match is too long",
    0x4D: "EPC match length wrong",
    0x4E: "Invalid EPC match mode",
    0x4F: "Invalid frequency range",
    0x50: "Failed to receive RN16 from tag",
    0x51: "Invalid DRM mode",
    0x52: "PLL can not lock",
    0x53: "No response from RF chip",
    0x54: "Can't achieve desired output power level",
    0x55: "Can't authenticate firmware copyright",
    0x56: "Spectrum regulation wrong",
    0x57: "Output power is too low",
    0xFF: "Unknown error",
}

BAUD_RATE_CODES = {
    38400: 0x03,
    115200: 0x04,
}
BAUD_CODE_TO_RATE = {value: key for key, value in BAUD_RATE_CODES.items()}
REGION_NAMES = {
    0x01: "FCC",
    0x02: "ETSI",
    0x03: "CHN",
    0x04: "CUSTOM",
}
BEEPER_MODE_NAMES = {
    0x00: "quiet",
    0x01: "inventory_round",
    0x02: "tag_detected",
}
RF_LINK_PROFILE_NAMES = {
    0xD0: "Profile 0: Tari 25uS, FM0 40KHz",
    0xD1: "Profile 1: Tari 25uS, Miller 4 250KHz",
    0xD2: "Profile 2: Tari 25uS, Miller 4 300KHz",
    0xD3: "Profile 3: Tari 6.25uS, FM0 400KHz",
}

NET_FLAG = b"CH9121_CFG_FLAG\x00"
NET_BROADCAST_PORT = 50000
NET_LOCAL_PORT = 60000


class RfidError(RuntimeError):
    pass


LogCallback = Callable[[str, bytes], None]


def checksum(data: bytes) -> int:
    total = sum(data) & 0xFF
    return ((~total) + 1) & 0xFF


def from_hex(value: str) -> bytes:
    clean = (
        value.strip()
        .replace("0x", "")
        .replace("0X", "")
        .replace(" ", "")
        .replace(":", "")
        .replace("\n", "")
        .replace("\r", "")
        .replace("\t", "")
    )
    if len(clean) % 2:
        raise ValueError(f"hex string must have even length: {value!r}")
    return bytes.fromhex(clean)


def to_hex(data: bytes, separator: str = "") -> str:
    return separator.join(f"{b:02X}" for b in data)


def to_u16_be(data: bytes, offset: int = 0) -> int:
    return (data[offset] << 8) | data[offset + 1]


def to_u32_be(data: bytes, offset: int = 0) -> int:
    return (
        (data[offset] << 24)
        | (data[offset + 1] << 16)
        | (data[offset + 2] << 8)
        | data[offset + 3]
    )


def to_u24_be(data: bytes, offset: int = 0) -> int:
    return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]


def from_u24_be(value: int) -> bytes:
    return bytes([(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF])


@dataclass
class MessageFrame:
    read_id: int
    cmd: int
    data: bytes = b""
    packet_type: int = 0xA0

    def encode(self) -> bytes:
        payload = bytes([self.packet_type, len(self.data) + 3, self.read_id & 0xFF, self.cmd & 0xFF]) + self.data
        return payload + bytes([checksum(payload)])

    @classmethod
    def decode(cls, raw: bytes) -> "MessageFrame":
        if len(raw) < 5:
            raise ValueError("frame too short")
        if raw[0] != 0xA0:
            raise ValueError(f"unexpected packet type: 0x{raw[0]:02X}")
        if len(raw) != raw[1] + 2:
            raise ValueError("frame length does not match length field")
        if checksum(raw[:-1]) != raw[-1]:
            raise ValueError("invalid checksum")
        return cls(read_id=raw[2], cmd=raw[3], data=raw[4:-1], packet_type=raw[0])


class FrameAccumulator:
    def __init__(self) -> None:
        self._buffer = bytearray()

    def feed(self, data: bytes) -> list[MessageFrame]:
        self._buffer.extend(data)
        frames: list[MessageFrame] = []
        while True:
            if not self._buffer:
                break
            try:
                start = self._buffer.index(0xA0)
            except ValueError:
                self._buffer.clear()
                break
            if start:
                del self._buffer[:start]
            if len(self._buffer) < 2:
                break
            frame_len = self._buffer[1] + 2
            if len(self._buffer) < frame_len:
                break
            raw = bytes(self._buffer[:frame_len])
            del self._buffer[:frame_len]
            try:
                frames.append(MessageFrame.decode(raw))
            except ValueError:
                continue
        return frames


@dataclass
class InventoryTag:
    epc: str
    pc: str
    rssi_dbm: int
    antenna: int
    frequency_mhz: float
    phase: Optional[str] = None

    @classmethod
    def parse(cls, data: bytes, read_phase: bool = False, ant_group: int = 0) -> "InventoryTag":
        if len(data) < (6 if read_phase else 4):
            raise ValueError(f"inventory payload too short: {len(data)}")

        idx = 0
        freq_ant = data[idx]
        idx += 1
        pc = data[idx:idx + 2]
        idx += 2
        epc_len = len(data) - (6 if read_phase else 4)
        epc = data[idx:idx + epc_len]
        idx += epc_len
        rssi_raw = data[idx]
        idx += 1
        phase = data[idx:idx + 2] if read_phase else b""

        freq = (freq_ant & 0xFC) >> 2
        ant_no = freq_ant & 0x03
        rssi_h = (rssi_raw & 0x80) >> 7
        rssi = rssi_raw & 0x7F
        antenna = ant_no + (0x04 if rssi_h else 0x00) + (0x08 if ant_group == 0x01 else 0x00) + 1

        return cls(
            epc=to_hex(epc, " "),
            pc=to_hex(pc, " "),
            rssi_dbm=rssi - 129,
            antenna=antenna,
            frequency_mhz=865.0 + (0.5 * freq),
            phase=to_hex(phase, " ") if phase else None,
        )


@dataclass
class TagOperationResult:
    command: int
    success_count: int
    status_code: Optional[int]
    status_message: Optional[str]
    pc: str
    epc: str
    crc: str
    data_hex: Optional[str]
    read_length_words: Optional[int]
    antenna: int
    read_count: int
    frequency_index: int


@dataclass
class ReaderSessionInfo:
    read_id: int
    firmware: Optional[str] = None
    temperature_c: Optional[int] = None
    identifier_hex: Optional[str] = None
    output_power: list[int] = field(default_factory=list)
    work_antenna: Optional[int] = None
    frequency_region: Optional[dict[str, object]] = None
    rf_link_profile: Optional[str] = None
    ant_connection_detector: Optional[int] = None


@dataclass
class AccessMatchResult:
    enabled: bool
    epc_hex: Optional[str]


@dataclass
class ReaderPowerConfig:
    uniform: bool
    power_dbm: Optional[int]
    per_antenna: list[int]


@dataclass
class ReaderAntennaState:
    antenna_id: int


@dataclass
class ReaderRegionConfig:
    mode: str
    region_code: int
    region_name: str
    start_freq: Optional[int] = None
    end_freq: Optional[int] = None
    freq_space_khz: Optional[int] = None
    freq_quantity: Optional[int] = None
    start_freq_khz: Optional[int] = None


@dataclass
class ReaderGpioState:
    gpio1: bool
    gpio2: bool


@dataclass
class ReaderBeeperConfig:
    mode: int
    mode_name: str


@dataclass
class ReaderDetectorConfig:
    enabled: bool
    sensitivity_db: int


@dataclass
class ReaderRfLinkProfile:
    profile_id: int
    profile_hex: str
    profile_name: str


@dataclass
class SerialPortInfo:
    device: str
    description: str
    hwid: str


class BaseTransport:
    def send(self, payload: bytes) -> None:
        raise NotImplementedError

    def recv(self, timeout: float) -> bytes:
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError


class TcpTransport(BaseTransport):
    def __init__(self, host: str, port: int, connect_timeout: float = 2.0) -> None:
        self.host = host
        self.port = port
        self.sock = socket.create_connection((host, port), timeout=connect_timeout)
        self.sock.settimeout(connect_timeout)

    def send(self, payload: bytes) -> None:
        self.sock.sendall(payload)

    def recv(self, timeout: float) -> bytes:
        self.sock.settimeout(timeout)
        return self.sock.recv(40960)

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


class SerialTransport(BaseTransport):
    def __init__(self, device: str, baudrate: int, timeout: float = 1.0) -> None:
        if serial is None:
            raise RfidError("pyserial is not installed. Run: python3 -m pip install pyserial")
        self.port = serial.Serial(port=device, baudrate=baudrate, timeout=timeout)  # type: ignore[attr-defined]

    def send(self, payload: bytes) -> None:
        self.port.write(payload)
        self.port.flush()

    def recv(self, timeout: float) -> bytes:
        self.port.timeout = timeout
        return self.port.read(40960)

    def close(self) -> None:
        try:
            self.port.close()
        except Exception:
            pass


class ReaderClient:
    def __init__(
        self,
        transport: BaseTransport,
        read_id: int = 0xFF,
        debug: bool = False,
        log_callback: Optional[LogCallback] = None,
    ) -> None:
        self.transport = transport
        self.read_id = read_id
        self.debug = debug
        self.accumulator = FrameAccumulator()
        self.log_callback = log_callback

    def close(self) -> None:
        self.transport.close()

    def _log(self, prefix: str, payload: bytes) -> None:
        if self.debug:
            print(f"{prefix}: {to_hex(payload, ' ')}", file=sys.stderr)
        if self.log_callback is not None:
            self.log_callback(prefix, payload)

    def _read_frames(self, timeout: float) -> list[MessageFrame]:
        chunk = self.transport.recv(timeout)
        if not chunk:
            return []
        self._log("recv", chunk)
        return self.accumulator.feed(chunk)

    def send_command(self, cmd: int, data: bytes = b"") -> None:
        frame = MessageFrame(read_id=self.read_id, cmd=cmd, data=data).encode()
        self._log("send", frame)
        self.transport.send(frame)

    def request_single(self, cmd: int, data: bytes = b"", timeout: float = 2.0) -> MessageFrame:
        self.send_command(cmd, data)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            frames = self._read_frames(max(0.05, deadline - time.monotonic()))
            for frame in frames:
                if frame.cmd == cmd:
                    return frame
        raise RfidError(f"timeout waiting for response to command 0x{cmd:02X}")

    def _request_success(self, cmd: int, data: bytes = b"", timeout: float = 2.0) -> MessageFrame:
        frame = self.request_single(cmd, data=data, timeout=timeout)
        if len(frame.data) == 1 and frame.data[0] != 0x10:
            code = frame.data[0]
            raise RfidError(ERROR_CODES.get(code, f"Unknown error 0x{code:02X}"))
        return frame

    @staticmethod
    def _decode_single_status_code(value: int) -> None:
        if value != 0x10:
            raise RfidError(ERROR_CODES.get(value, f"Unknown error 0x{value:02X}"))

    @staticmethod
    def _validate_power(power_dbm: int, *, minimum: int = 0, maximum: int = 33) -> int:
        if not minimum <= power_dbm <= maximum:
            raise RfidError(f"power must be between {minimum} and {maximum} dBm")
        return power_dbm

    @staticmethod
    def _antenna_to_wire(antenna_id: int) -> int:
        if antenna_id not in {1, 2, 3, 4}:
            raise RfidError("antenna_id must be between 1 and 4")
        return antenna_id - 1

    def get_firmware_version(self, timeout: float = 2.0) -> str:
        frame = self.request_single(0x72, timeout=timeout)
        if len(frame.data) == 1:
            code = frame.data[0]
            raise RfidError(ERROR_CODES.get(code, f"Unknown error 0x{code:02X}"))
        return ".".join(str(part) for part in frame.data)

    def get_temperature(self, timeout: float = 2.0) -> int:
        frame = self.request_single(0x7B, timeout=timeout)
        if len(frame.data) == 1:
            code = frame.data[0]
            raise RfidError(ERROR_CODES.get(code, f"Unknown error 0x{code:02X}"))
        if len(frame.data) < 2:
            raise RfidError("unexpected temperature payload")
        sign = -1 if frame.data[0] == 0x00 else 1
        return sign * frame.data[1]

    def get_identifier(self, timeout: float = 2.0) -> str:
        frame = self.request_single(0x68, timeout=timeout)
        if len(frame.data) == 1:
            code = frame.data[0]
            raise RfidError(ERROR_CODES.get(code, f"Unknown error 0x{code:02X}"))
        return to_hex(frame.data, " ")

    def get_output_power(self, timeout: float = 2.0, four_channel: bool = False) -> list[int]:
        frame = self.request_single(0x77, timeout=timeout)
        return list(frame.data)

    def get_output_power_config(self, timeout: float = 2.0) -> ReaderPowerConfig:
        powers = self.get_output_power(timeout=timeout)
        if not powers:
            raise RfidError("unexpected empty output power payload")
        if len(powers) == 1:
            return ReaderPowerConfig(uniform=True, power_dbm=powers[0], per_antenna=[powers[0]] * 4)
        if len(powers) == 4:
            uniform = len(set(powers)) == 1
            return ReaderPowerConfig(uniform=uniform, power_dbm=powers[0] if uniform else None, per_antenna=powers)
        raise RfidError(f"unexpected output power payload length: {len(powers)}")

    def set_uart_baudrate(self, baudrate: int, timeout: float = 2.0) -> dict[str, Optional[int]]:
        if baudrate not in BAUD_RATE_CODES:
            raise RfidError(f"unsupported baudrate {baudrate}; supported values: {sorted(BAUD_RATE_CODES)}")
        frame = self.request_single(0x71, data=bytes([BAUD_RATE_CODES[baudrate]]), timeout=timeout)
        if len(frame.data) != 1:
            raise RfidError("unexpected baudrate response payload")
        previous_baud = BAUD_CODE_TO_RATE.get(frame.data[0])
        if previous_baud is None and frame.data[0] != 0x10:
            self._decode_single_status_code(frame.data[0])
        return {
            "previous_baudrate": previous_baud,
            "baudrate": baudrate,
        }

    def set_reader_address(self, read_id: int, timeout: float = 2.0) -> int:
        if not 0 <= read_id <= 0xFE:
            raise RfidError("reader address must be between 0 and 254")
        self._request_success(0x73, bytes([read_id & 0xFF]), timeout=timeout)
        self.read_id = read_id
        return self.read_id

    def set_work_antenna(self, antenna_id: int, timeout: float = 2.0) -> ReaderAntennaState:
        self._request_success(0x74, bytes([self._antenna_to_wire(antenna_id)]), timeout=timeout)
        return ReaderAntennaState(antenna_id=antenna_id)

    def get_work_antenna(self, timeout: float = 2.0) -> ReaderAntennaState:
        frame = self.request_single(0x75, timeout=timeout)
        if len(frame.data) != 1:
            raise RfidError("unexpected work antenna payload")
        if frame.data[0] > 0x03:
            self._decode_single_status_code(frame.data[0])
        return ReaderAntennaState(antenna_id=frame.data[0] + 1)

    def set_output_power(self, power: int | list[int], timeout: float = 2.0) -> ReaderPowerConfig:
        if isinstance(power, int):
            value = self._validate_power(power)
            self._request_success(0x76, bytes([value]), timeout=timeout)
            return ReaderPowerConfig(uniform=True, power_dbm=value, per_antenna=[value] * 4)

        if len(power) != 4:
            raise RfidError("per-antenna power must contain exactly 4 values")
        payload = bytes(self._validate_power(int(item)) for item in power)
        self._request_success(0x76, payload, timeout=timeout)
        uniform = len(set(power)) == 1
        return ReaderPowerConfig(uniform=uniform, power_dbm=power[0] if uniform else None, per_antenna=list(power))

    def set_temporary_output_power(self, power_dbm: int, timeout: float = 2.0) -> ReaderPowerConfig:
        value = self._validate_power(power_dbm, minimum=20)
        self._request_success(0x66, bytes([value]), timeout=timeout)
        return ReaderPowerConfig(uniform=True, power_dbm=value, per_antenna=[value] * 4)

    def set_frequency_region(
        self,
        region_code: int,
        *,
        start_freq: Optional[int] = None,
        end_freq: Optional[int] = None,
        freq_space_khz: Optional[int] = None,
        freq_quantity: Optional[int] = None,
        start_freq_khz: Optional[int] = None,
        timeout: float = 2.0,
    ) -> ReaderRegionConfig:
        if region_code in {0x01, 0x02, 0x03}:
            if start_freq is None or end_freq is None:
                raise RfidError("start_freq and end_freq are required for system regions")
            if not 0 <= start_freq <= 0xFF or not 0 <= end_freq <= 0xFF or start_freq > end_freq:
                raise RfidError("start_freq/end_freq must be 0-255 and start_freq <= end_freq")
            payload = bytes([region_code, start_freq, end_freq])
            self._request_success(0x78, payload, timeout=timeout)
            return ReaderRegionConfig(
                mode="system",
                region_code=region_code,
                region_name=REGION_NAMES[region_code],
                start_freq=start_freq,
                end_freq=end_freq,
            )

        if region_code == 0x04:
            if freq_space_khz is None or freq_quantity is None or start_freq_khz is None:
                raise RfidError("freq_space_khz, freq_quantity and start_freq_khz are required for custom regions")
            if freq_space_khz <= 0 or freq_quantity <= 0 or start_freq_khz <= 0:
                raise RfidError("custom frequency settings must be positive")
            payload = bytes([0x04, int(freq_space_khz // 10) & 0xFF, freq_quantity & 0xFF]) + from_u24_be(start_freq_khz)
            self._request_success(0x78, payload, timeout=timeout)
            return ReaderRegionConfig(
                mode="custom",
                region_code=0x04,
                region_name=REGION_NAMES[0x04],
                freq_space_khz=int(freq_space_khz),
                freq_quantity=freq_quantity,
                start_freq_khz=start_freq_khz,
            )

        raise RfidError(f"unsupported region_code 0x{region_code:02X}")

    def get_frequency_region(self, timeout: float = 2.0) -> ReaderRegionConfig:
        frame = self.request_single(0x79, timeout=timeout)
        if len(frame.data) == 1:
            self._decode_single_status_code(frame.data[0])
        if len(frame.data) == 3:
            region_code = frame.data[0]
            return ReaderRegionConfig(
                mode="system",
                region_code=region_code,
                region_name=REGION_NAMES.get(region_code, f"0x{region_code:02X}"),
                start_freq=frame.data[1],
                end_freq=frame.data[2],
            )
        if len(frame.data) == 6 and frame.data[0] == 0x04:
            return ReaderRegionConfig(
                mode="custom",
                region_code=0x04,
                region_name=REGION_NAMES[0x04],
                freq_space_khz=frame.data[1] * 10,
                freq_quantity=frame.data[2],
                start_freq_khz=to_u24_be(frame.data, 3),
            )
        raise RfidError(f"unexpected frequency region payload length: {len(frame.data)}")

    def set_beeper_mode(self, mode: int, timeout: float = 2.0) -> ReaderBeeperConfig:
        if mode not in BEEPER_MODE_NAMES:
            raise RfidError("beeper mode must be 0, 1 or 2")
        self._request_success(0x7A, bytes([mode]), timeout=timeout)
        return ReaderBeeperConfig(mode=mode, mode_name=BEEPER_MODE_NAMES[mode])

    def read_gpio_value(self, timeout: float = 2.0) -> ReaderGpioState:
        frame = self.request_single(0x60, timeout=timeout)
        if len(frame.data) != 2:
            raise RfidError("unexpected GPIO payload")
        return ReaderGpioState(gpio1=frame.data[0] == 0x01, gpio2=frame.data[1] == 0x01)

    def write_gpio_value(self, gpio: int, value: bool, timeout: float = 2.0) -> dict[str, object]:
        if gpio not in {3, 4}:
            raise RfidError("gpio must be 3 or 4")
        choose_gpio = 0x03 if gpio == 3 else 0x04
        self._request_success(0x61, bytes([choose_gpio, 0x01 if value else 0x00]), timeout=timeout)
        return {"gpio": gpio, "value": bool(value)}

    def set_ant_connection_detector(self, sensitivity_db: int, timeout: float = 2.0) -> ReaderDetectorConfig:
        if not 0 <= sensitivity_db <= 255:
            raise RfidError("sensitivity_db must be between 0 and 255")
        self._request_success(0x62, bytes([sensitivity_db & 0xFF]), timeout=timeout)
        return ReaderDetectorConfig(enabled=sensitivity_db > 0, sensitivity_db=sensitivity_db)

    def get_ant_connection_detector(self, timeout: float = 2.0) -> ReaderDetectorConfig:
        frame = self.request_single(0x63, timeout=timeout)
        if len(frame.data) != 1:
            raise RfidError("unexpected antenna detector payload")
        if frame.data[0] > 100:
            self._decode_single_status_code(frame.data[0])
        return ReaderDetectorConfig(enabled=frame.data[0] > 0, sensitivity_db=frame.data[0])

    def set_reader_identifier(self, identifier_hex: str, timeout: float = 2.0) -> str:
        identifier = from_hex(identifier_hex)
        if len(identifier) != 12:
            raise RfidError("identifier_hex must be exactly 12 bytes")
        self._request_success(0x67, identifier, timeout=timeout)
        return to_hex(identifier, " ")

    def set_rf_link_profile(self, profile_id: int, timeout: float = 2.0) -> ReaderRfLinkProfile:
        if profile_id not in RF_LINK_PROFILE_NAMES:
            raise RfidError(f"unsupported rf link profile 0x{profile_id:02X}")
        self._request_success(0x69, bytes([profile_id & 0xFF]), timeout=timeout)
        return ReaderRfLinkProfile(profile_id=profile_id, profile_hex=f"{profile_id:02X}", profile_name=RF_LINK_PROFILE_NAMES[profile_id])

    def get_rf_link_profile(self, timeout: float = 2.0) -> ReaderRfLinkProfile:
        frame = self.request_single(0x6A, timeout=timeout)
        if len(frame.data) != 1:
            raise RfidError("unexpected RF link profile payload")
        profile_id = frame.data[0]
        if profile_id not in RF_LINK_PROFILE_NAMES:
            self._decode_single_status_code(profile_id)
        return ReaderRfLinkProfile(profile_id=profile_id, profile_hex=f"{profile_id:02X}", profile_name=RF_LINK_PROFILE_NAMES[profile_id])

    def get_rf_port_return_loss(self, freq_parameter: int, timeout: float = 2.0) -> int:
        if not 0 <= freq_parameter <= 255:
            raise RfidError("freq_parameter must be between 0 and 255")
        frame = self.request_single(0x7E, data=bytes([freq_parameter & 0xFF]), timeout=timeout)
        if len(frame.data) != 1:
            raise RfidError("unexpected return loss payload")
        if frame.data[0] > 80:
            self._decode_single_status_code(frame.data[0])
        return frame.data[0]

    def set_access_epc_match(self, epc_hex: str, timeout: float = 2.0, mode: int = 0x00) -> None:
        epc = from_hex(epc_hex)
        if len(epc) > 255:
            raise RfidError("EPC too long")
        payload = bytes([mode, len(epc)]) + epc
        self._request_success(0x85, payload, timeout=timeout)

    def clear_access_epc_match(self, timeout: float = 2.0, mode: int = 0x01) -> None:
        self._request_success(0x85, bytes([mode]), timeout=timeout)

    def get_access_epc_match(self, timeout: float = 2.0) -> AccessMatchResult:
        frame = self.request_single(0x86, timeout=timeout)
        if len(frame.data) == 1:
            if frame.data[0] == 0x01:
                return AccessMatchResult(enabled=False, epc_hex=None)
            code = frame.data[0]
            raise RfidError(ERROR_CODES.get(code, f"Unknown error 0x{code:02X}"))
        if frame.data[0] != 0x00 or len(frame.data) < 2:
            raise RfidError("unexpected access EPC match payload")
        epc_len = frame.data[1]
        epc = frame.data[2:2 + epc_len]
        return AccessMatchResult(enabled=True, epc_hex=to_hex(epc, " "))

    def read_tag(
        self,
        mem_bank: int,
        word_address: int,
        word_count: int,
        password_hex: str = "00000000",
        timeout: float = 3.0,
    ) -> TagOperationResult:
        password = from_hex(password_hex)
        if len(password) != 4:
            raise RfidError("passwordHex must be exactly 4 bytes")
        payload = bytes([mem_bank & 0xFF, word_address & 0xFF, word_count & 0xFF]) + password
        frame = self.request_single(0x81, data=payload, timeout=timeout)
        return parse_tag_operation_frame(frame)

    def write_tag(
        self,
        mem_bank: int,
        word_address: int,
        data_hex: str,
        password_hex: str = "00000000",
        timeout: float = 3.0,
    ) -> TagOperationResult:
        password = from_hex(password_hex)
        if len(password) != 4:
            raise RfidError("passwordHex must be exactly 4 bytes")
        raw = from_hex(data_hex)
        word_count = (len(raw) // 2) + (len(raw) % 2)
        payload = password + bytes([mem_bank & 0xFF, word_address & 0xFF, word_count & 0xFF]) + raw
        frame = self.request_single(0x82, data=payload, timeout=timeout)
        return parse_tag_operation_frame(frame)

    def lock_tag(
        self,
        mem_bank: int,
        lock_type: int,
        password_hex: str = "00000000",
        timeout: float = 3.0,
    ) -> TagOperationResult:
        password = from_hex(password_hex)
        if len(password) != 4:
            raise RfidError("passwordHex must be exactly 4 bytes")
        payload = password + bytes([mem_bank & 0xFF, lock_type & 0xFF])
        frame = self.request_single(0x83, data=payload, timeout=timeout)
        return parse_tag_operation_frame(frame)

    def kill_tag(self, password_hex: str = "00000000", timeout: float = 3.0) -> TagOperationResult:
        password = from_hex(password_hex)
        if len(password) != 4:
            raise RfidError("passwordHex must be exactly 4 bytes")
        frame = self.request_single(0x84, data=password, timeout=timeout)
        return parse_tag_operation_frame(frame)

    def get_session_info(self, timeout: float = 2.0) -> ReaderSessionInfo:
        output_power = self.get_output_power_config(timeout=timeout)
        antenna = self.get_work_antenna(timeout=timeout)
        region = self.get_frequency_region(timeout=timeout)
        rf_link = self.get_rf_link_profile(timeout=timeout)
        ant_detector = self.get_ant_connection_detector(timeout=timeout)
        return ReaderSessionInfo(
            read_id=self.read_id,
            firmware=self.get_firmware_version(timeout=timeout),
            temperature_c=self.get_temperature(timeout=timeout),
            identifier_hex=self.get_identifier(timeout=timeout),
            output_power=output_power.per_antenna,
            work_antenna=antenna.antenna_id,
            frequency_region=asdict(region),
            rf_link_profile=rf_link.profile_hex,
            ant_connection_detector=ant_detector.sensitivity_db,
        )

    def inventory_once(self, rounds: int = 1, timeout: float = 4.0, read_phase: bool = False) -> tuple[list[InventoryTag], Optional[dict[str, int]]]:
        self.send_command(0x89, bytes([rounds & 0xFF]))
        tags: list[InventoryTag] = []
        summary: Optional[dict[str, int]] = None
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            frames = self._read_frames(max(0.05, deadline - time.monotonic()))
            if not frames:
                continue
            for frame in frames:
                if frame.cmd != 0x89:
                    continue
                if len(frame.data) == 1:
                    code = frame.data[0]
                    raise RfidError(f"inventory failed: {ERROR_CODES.get(code, f'Unknown error 0x{code:02X}')}")
                if len(frame.data) == 7:
                    summary = {
                        "antenna_id": frame.data[0],
                        "read_rate": to_u16_be(frame.data, 1),
                        "total_read": to_u32_be(frame.data, 3),
                    }
                    return tags, summary
                try:
                    tags.append(InventoryTag.parse(frame.data, read_phase=read_phase))
                except ValueError:
                    continue

        raise RfidError("inventory timed out before completion summary was received")


@dataclass
class DeviceHwConfig:
    dev_type: int
    aux_dev_type: int
    index: int
    hardware_version: int
    software_version: int
    module_name: str
    mac: str
    ip: str
    gateway: str
    subnet_mask: str
    dhcp_enabled: bool
    web_port: int
    username: str
    password_enabled: bool
    password: str
    update_flag: bool
    serial_config_enabled: bool


@dataclass
class DevicePortConfig:
    index: int
    enabled: bool
    net_mode: int
    random_source_port: bool
    net_port: int
    destination_ip: str
    destination_port: int
    baudrate: int
    data_bits: int
    stop_bits: int
    parity: int
    phy_disconnect_handle: bool
    rx_packet_length: int
    rx_packet_timeout: int
    reconnect_count: int
    reset_ctrl: bool
    dns_enabled: bool
    domain_name: str
    dns_host_ip: str
    dns_host_port: int


@dataclass
class FoundDevice:
    ip: str
    name: str
    version: int


@dataclass
class NetCommPacket:
    flag: str
    cmd: int
    device_mac: str
    pc_mac: str
    length: int
    found_device: Optional[FoundDevice] = None
    hw_config: Optional[DeviceHwConfig] = None
    port0: Optional[DevicePortConfig] = None
    port1: Optional[DevicePortConfig] = None


@dataclass
class NetScanResult:
    packet: NetCommPacket
    source_ip: str


class NetCommand:
    SET = 0x01
    GET = 0x02
    RESET = 0x03
    SEARCH = 0x04
    SET_BASE = 0x05
    SET_PORT1 = 0x06
    SET_PORT2 = 0x07
    RESERVE = 0xFF
    ACK_SET = 0x81
    ACK_GET = 0x82
    ACK_RESET = 0x83
    ACK_SEARCH = 0x84
    ACK_SET_BASE = 0x85
    ACK_SET_PORT1 = 0x86
    ACK_SET_PORT2 = 0x87


class NetPortClient:
    def __init__(self, bind_ip: str, debug: bool = False, log_callback: Optional[LogCallback] = None) -> None:
        self.bind_ip = bind_ip
        self.debug = debug
        self.log_callback = log_callback

    def _socket(self) -> socket.socket:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.bind((self.bind_ip, NET_LOCAL_PORT))
        return sock

    def _send(self, sock: socket.socket, payload: bytes) -> None:
        if self.debug:
            print(f"udp-send: {to_hex(payload, ' ')}", file=sys.stderr)
        if self.log_callback is not None:
            self.log_callback("udp-send", payload)
        sock.sendto(payload, ("255.255.255.255", NET_BROADCAST_PORT))

    def _recv_packet(self, sock: socket.socket) -> tuple[NetCommPacket, tuple[str, int]]:
        data, addr = sock.recvfrom(2048)
        if self.debug:
            print(f"udp-recv[{addr[0]}]: {to_hex(data, ' ')}", file=sys.stderr)
        if self.log_callback is not None:
            self.log_callback("udp-recv", data)
        return parse_net_comm(data), addr

    def search(self, duration: float = 3.0) -> list[NetScanResult]:
        payload = NET_FLAG + bytes([NetCommand.SEARCH])
        found: dict[str, NetScanResult] = {}
        with self._socket() as sock:
            sock.settimeout(0.25)
            end = time.monotonic() + duration
            while time.monotonic() < end:
                self._send(sock, payload)
                round_end = min(end, time.monotonic() + 0.9)
                while time.monotonic() < round_end:
                    try:
                        packet, addr = self._recv_packet(sock)
                    except socket.timeout:
                        continue
                    if packet.cmd == NetCommand.ACK_SEARCH and packet.found_device:
                        found[packet.device_mac] = NetScanResult(packet=packet, source_ip=addr[0])
        return list(found.values())

    def get(self, device_mac: str, timeout: float = 3.0) -> NetCommPacket:
        payload = NET_FLAG + bytes([NetCommand.GET]) + normalize_mac_bytes(device_mac)
        return self._request(payload, {NetCommand.ACK_GET}, timeout=timeout, device_mac=device_mac)

    def set(
        self,
        device_mac: str,
        pc_mac: str,
        hw_config: DeviceHwConfig,
        port0: DevicePortConfig,
        port1: DevicePortConfig,
        timeout: float = 3.0,
    ) -> NetCommPacket:
        payload = build_netport_packet(NetCommand.SET, device_mac, pc_mac, hw_config, port0, port1)
        return self._request(payload, {NetCommand.ACK_SET}, timeout=timeout, device_mac=device_mac)

    def reset(self, device_mac: str, timeout: float = 3.0) -> NetCommPacket:
        payload = NET_FLAG + bytes([NetCommand.RESET]) + normalize_mac_bytes(device_mac)
        return self._request(payload, {NetCommand.ACK_RESET}, timeout=timeout, device_mac=device_mac)

    def restore_default(self, device_mac: str, pc_mac: str, timeout: float = 3.0) -> NetCommPacket:
        payload = build_default_netport_packet(device_mac, pc_mac)
        return self._request(payload, {NetCommand.ACK_SET}, timeout=timeout, device_mac=device_mac)

    def _request(
        self,
        payload: bytes,
        expected_cmds: set[int],
        timeout: float,
        device_mac: Optional[str] = None,
    ) -> NetCommPacket:
        with self._socket() as sock:
            sock.settimeout(0.25)
            self._send(sock, payload)
            end = time.monotonic() + timeout
            while time.monotonic() < end:
                try:
                    packet, _addr = self._recv_packet(sock)
                except socket.timeout:
                    continue
                if packet.cmd in expected_cmds and (device_mac is None or packet.device_mac.lower() == normalize_mac(device_mac)):
                    return packet
        raise RfidError(f"timeout waiting for NetPort response from {device_mac or 'broadcast'}")


def normalize_mac(value: str) -> str:
    return ":".join(to_hex(from_hex(value))[i:i + 2] for i in range(0, 12, 2)).lower()


def normalize_mac_bytes(value: str) -> bytes:
    return from_hex(value)


def bytes_to_ip(data: bytes) -> str:
    return ".".join(str(part) for part in data)


def safe_ascii(data: bytes) -> str:
    return data.split(b"\x00", 1)[0].decode("ascii", errors="ignore").strip()


def encode_fixed_ascii(value: str, length: int) -> bytes:
    raw = value.encode("ascii", errors="ignore")[:length]
    return raw.ljust(length, b"\x00")


def list_serial_ports() -> list[SerialPortInfo]:
    if list_ports is None:
        return []
    return [
        SerialPortInfo(device=port.device, description=port.description, hwid=port.hwid)
        for port in list_ports.comports()
    ]


def parse_tag_operation_frame(frame: MessageFrame, ant_group: int = 0) -> TagOperationResult:
    data = frame.data
    if len(data) == 1:
        code = data[0]
        raise RfidError(ERROR_CODES.get(code, f"Unknown error 0x{code:02X}"))
    if len(data) < 6:
        raise RfidError("unexpected tag operation payload")

    success_count = to_u16_be(data, 0)
    tag_data_len = data[2]
    tag_data_end = 3 + tag_data_len
    if len(data) < tag_data_end + 3:
        raise RfidError("malformed tag operation payload")

    tag_data = data[3:tag_data_end]
    status_or_read_len = data[tag_data_end]
    ant_id = data[tag_data_end + 1]
    count_byte = data[tag_data_end + 2]

    freq = (ant_id & 0xFC) >> 2
    ant_no = ant_id & 0x03
    count_high = (count_byte & 0x80) >> 7
    antenna = ant_no + (0x04 if count_high else 0x00) + (0x08 if ant_group == 0x01 else 0x00) + 1
    read_count = count_byte & 0x7F

    read_length_words = status_or_read_len if frame.cmd == 0x81 else None
    status_code = None if frame.cmd == 0x81 else status_or_read_len
    status_message = None if status_code is None else ERROR_CODES.get(status_code, f"Unknown error 0x{status_code:02X}")

    op_data_len = read_length_words or 0
    if len(tag_data) < 4 + op_data_len:
        raise RfidError("tag payload shorter than expected")
    pc = tag_data[:2]
    epc_len = len(tag_data) - 4 - op_data_len
    if epc_len < 0:
        raise RfidError("invalid EPC length in tag payload")
    epc = tag_data[2:2 + epc_len]
    crc = tag_data[2 + epc_len:4 + epc_len]
    op_data = tag_data[4 + epc_len:] if op_data_len else b""

    if status_code is not None and status_code != 0x10:
        raise RfidError(ERROR_CODES.get(status_code, f"Unknown error 0x{status_code:02X}"))

    return TagOperationResult(
        command=frame.cmd,
        success_count=success_count,
        status_code=status_code,
        status_message=status_message,
        pc=to_hex(pc, " "),
        epc=to_hex(epc, " "),
        crc=to_hex(crc, " "),
        data_hex=to_hex(op_data, " ") if op_data else None,
        read_length_words=read_length_words,
        antenna=antenna,
        read_count=read_count,
        frequency_index=freq,
    )


def parse_found_device(data: bytes) -> FoundDevice:
    return FoundDevice(
        ip=bytes_to_ip(data[0:4]),
        name=safe_ascii(data[4:-1]),
        version=data[-1],
    )


def parse_hw_config(data: bytes) -> DeviceHwConfig:
    return DeviceHwConfig(
        dev_type=data[0],
        aux_dev_type=data[1],
        index=data[2],
        hardware_version=data[3],
        software_version=data[4],
        module_name=safe_ascii(data[5:26]),
        mac=normalize_mac(to_hex(data[26:32])),
        ip=bytes_to_ip(data[32:36]),
        gateway=bytes_to_ip(data[36:40]),
        subnet_mask=bytes_to_ip(data[40:44]),
        dhcp_enabled=data[44] == 1,
        web_port=data[45] | (data[46] << 8),
        username=safe_ascii(data[47:55]),
        password_enabled=data[55] == 1,
        password=safe_ascii(data[56:64]),
        update_flag=data[64] == 1,
        serial_config_enabled=data[65] == 1,
    )


def parse_port_config(data: bytes) -> DevicePortConfig:
    return DevicePortConfig(
        index=data[0],
        enabled=data[1] == 1,
        net_mode=data[2],
        random_source_port=data[3] == 1,
        net_port=data[4] | (data[5] << 8),
        destination_ip=bytes_to_ip(data[6:10]),
        destination_port=data[10] | (data[11] << 8),
        baudrate=(data[12]) | (data[13] << 8) | (data[14] << 16) | (data[15] << 24),
        data_bits=data[16],
        stop_bits=data[17],
        parity=data[18],
        phy_disconnect_handle=data[19] == 1,
        rx_packet_length=(data[20]) | (data[21] << 8) | (data[22] << 16) | (data[23] << 24),
        rx_packet_timeout=(data[24]) | (data[25] << 8) | (data[26] << 16) | (data[27] << 24),
        reconnect_count=data[28],
        reset_ctrl=data[29] == 1,
        dns_enabled=data[30] == 1,
        domain_name=safe_ascii(data[31:51]),
        dns_host_ip=bytes_to_ip(data[51:55]),
        dns_host_port=data[55] | (data[56] << 8),
    )


def encode_hw_config(config: DeviceHwConfig) -> bytes:
    payload = bytearray()
    payload.append(config.dev_type & 0xFF)
    payload.append(config.aux_dev_type & 0xFF)
    payload.append(config.index & 0xFF)
    payload.append(config.hardware_version & 0xFF)
    payload.append(config.software_version & 0xFF)
    payload.extend(encode_fixed_ascii(config.module_name, 21))
    payload.extend(normalize_mac_bytes(config.mac))
    payload.extend(socket.inet_aton(config.ip))
    payload.extend(socket.inet_aton(config.gateway))
    payload.extend(socket.inet_aton(config.subnet_mask))
    payload.append(0x01 if config.dhcp_enabled else 0x00)
    payload.extend(int(config.web_port).to_bytes(2, "little"))
    payload.extend(encode_fixed_ascii(config.username, 8))
    payload.append(0x01 if config.password_enabled else 0x00)
    payload.extend(encode_fixed_ascii(config.password, 8))
    payload.append(0x01 if config.update_flag else 0x00)
    payload.append(0x01 if config.serial_config_enabled else 0x00)
    payload.extend(b"\x00" * 8)
    return bytes(payload)


def encode_port_config(config: DevicePortConfig) -> bytes:
    payload = bytearray()
    payload.append(config.index & 0xFF)
    payload.append(0x01 if config.enabled else 0x00)
    payload.append(config.net_mode & 0xFF)
    payload.append(0x01 if config.random_source_port else 0x00)
    payload.extend(int(config.net_port).to_bytes(2, "little"))
    payload.extend(socket.inet_aton(config.destination_ip))
    payload.extend(int(config.destination_port).to_bytes(2, "little"))
    payload.extend(int(config.baudrate).to_bytes(4, "little"))
    payload.append(config.data_bits & 0xFF)
    payload.append(config.stop_bits & 0xFF)
    payload.append(config.parity & 0xFF)
    payload.append(0x01 if config.phy_disconnect_handle else 0x00)
    payload.extend(int(config.rx_packet_length).to_bytes(4, "little"))
    payload.extend(int(config.rx_packet_timeout).to_bytes(4, "little"))
    payload.append(config.reconnect_count & 0xFF)
    payload.append(0x01 if config.reset_ctrl else 0x00)
    payload.append(0x01 if config.dns_enabled else 0x00)
    payload.extend(encode_fixed_ascii(config.domain_name, 20))
    payload.extend(socket.inet_aton(config.dns_host_ip))
    payload.extend(int(config.dns_host_port).to_bytes(2, "little"))
    payload.extend(b"\x00" * 8)
    return bytes(payload)


def build_netport_packet(
    cmd: int,
    device_mac: str,
    pc_mac: str,
    hw_config: Optional[DeviceHwConfig] = None,
    port0: Optional[DevicePortConfig] = None,
    port1: Optional[DevicePortConfig] = None,
) -> bytes:
    payload = bytearray()
    payload.extend(NET_FLAG)
    payload.append(cmd & 0xFF)
    payload.extend(normalize_mac_bytes(device_mac))
    payload.extend(normalize_mac_bytes(pc_mac))
    if hw_config is not None and port0 is not None and port1 is not None:
        payload.append(204)
        payload.extend(encode_hw_config(hw_config))
        payload.extend(encode_port_config(port0))
        payload.extend(encode_port_config(port1))
    return bytes(payload)


def build_default_netport_packet(device_mac: str, pc_mac: str) -> bytes:
    hw = DeviceHwConfig(
        dev_type=0x21,
        aux_dev_type=0x21,
        index=1,
        hardware_version=2,
        software_version=6,
        module_name="RoNetPort",
        mac=normalize_mac(device_mac),
        ip="192.168.0.178",
        gateway="192.168.0.1",
        subnet_mask="255.255.255.0",
        dhcp_enabled=False,
        web_port=80,
        username="admin",
        password_enabled=False,
        password="",
        update_flag=False,
        serial_config_enabled=False,
    )
    port0 = DevicePortConfig(
        index=0,
        enabled=False,
        net_mode=1,
        random_source_port=True,
        net_port=3000,
        destination_ip="192.168.1.100",
        destination_port=2000,
        baudrate=9600,
        data_bits=8,
        stop_bits=1,
        parity=4,
        phy_disconnect_handle=True,
        rx_packet_length=1024,
        rx_packet_timeout=0,
        reconnect_count=0,
        reset_ctrl=False,
        dns_enabled=False,
        domain_name="",
        dns_host_ip="0.0.0.0",
        dns_host_port=0,
    )
    port1 = DevicePortConfig(
        index=1,
        enabled=True,
        net_mode=0,
        random_source_port=False,
        net_port=4001,
        destination_ip="192.168.0.200",
        destination_port=1000,
        baudrate=115200,
        data_bits=8,
        stop_bits=1,
        parity=4,
        phy_disconnect_handle=False,
        rx_packet_length=1024,
        rx_packet_timeout=0,
        reconnect_count=0,
        reset_ctrl=False,
        dns_enabled=False,
        domain_name="",
        dns_host_ip="0.0.0.0",
        dns_host_port=0,
    )
    return build_netport_packet(NetCommand.SET, device_mac, pc_mac, hw, port0, port1)


def build_cfg_blob(
    pc_mac: str,
    hw_config: DeviceHwConfig,
    port0: DevicePortConfig,
    port1: DevicePortConfig,
    device_mac: str = "11:22:33:44:55:66",
) -> bytes:
    return build_netport_packet(NetCommand.RESERVE, device_mac, pc_mac, hw_config, port0, port1)


def parse_net_comm(raw: bytes) -> NetCommPacket:
    if len(raw) < 30:
        raise RfidError(f"NetPort packet too short: {len(raw)}")
    flag = safe_ascii(raw[0:15])
    cmd = raw[16]
    device_mac = normalize_mac(to_hex(raw[17:23]))
    pc_mac = normalize_mac(to_hex(raw[23:29]))
    length = raw[29]

    packet = NetCommPacket(flag=flag, cmd=cmd, device_mac=device_mac, pc_mac=pc_mac, length=length)
    if cmd == NetCommand.ACK_SEARCH:
        packet.found_device = parse_found_device(raw[30:30 + length + 1])
    elif cmd in {NetCommand.ACK_GET, NetCommand.ACK_SET, NetCommand.RESERVE}:
        packet.hw_config = parse_hw_config(raw[30:104])
        packet.port0 = parse_port_config(raw[104:169])
        packet.port1 = parse_port_config(raw[169:234])
    return packet


def print_json(data: object) -> None:
    print(json.dumps(data, indent=2, sort_keys=False))


def parse_read_id(value: str) -> int:
    return int(value, 16)


def parse_identifier_hex(value: str) -> str:
    raw = from_hex(value)
    if len(raw) != 12:
        raise argparse.ArgumentTypeError("identifier must be exactly 12 bytes / 24 hex chars")
    return to_hex(raw)


def parse_antenna(value: str) -> int:
    antenna = int(value)
    if antenna not in {1, 2, 3, 4}:
        raise argparse.ArgumentTypeError("antenna must be between 1 and 4")
    return antenna


def parse_power(value: str) -> int:
    power = int(value)
    if not 0 <= power <= 33:
        raise argparse.ArgumentTypeError("power must be between 0 and 33 dBm")
    return power


def parse_temp_power(value: str) -> int:
    power = parse_power(value)
    if power < 20:
        raise argparse.ArgumentTypeError("temporary power must be between 20 and 33 dBm")
    return power


def parse_baudrate(value: str) -> int:
    baud = int(value)
    if baud not in BAUD_RATE_CODES:
        raise argparse.ArgumentTypeError(f"baudrate must be one of {sorted(BAUD_RATE_CODES)}")
    return baud


def parse_beeper_mode(value: str) -> int:
    normalized = value.strip().lower()
    aliases = {
        "0": 0,
        "quiet": 0,
        "1": 1,
        "inventory": 1,
        "inventory_round": 1,
        "2": 2,
        "tag": 2,
        "tag_detected": 2,
    }
    if normalized not in aliases:
        raise argparse.ArgumentTypeError("beeper mode must be one of: 0, 1, 2, quiet, inventory, tag")
    return aliases[normalized]


def parse_region(value: str) -> int:
    normalized = value.strip().upper()
    aliases = {
        "1": 0x01,
        "FCC": 0x01,
        "2": 0x02,
        "ETSI": 0x02,
        "3": 0x03,
        "CHN": 0x03,
        "4": 0x04,
        "CUSTOM": 0x04,
    }
    if normalized not in aliases:
        raise argparse.ArgumentTypeError("region must be FCC, ETSI, CHN or CUSTOM")
    return aliases[normalized]


def parse_rf_profile(value: str) -> int:
    normalized = value.strip().upper()
    aliases = {
        "0": 0xD0,
        "D0": 0xD0,
        "1": 0xD1,
        "D1": 0xD1,
        "2": 0xD2,
        "D2": 0xD2,
        "3": 0xD3,
        "D3": 0xD3,
    }
    if normalized not in aliases:
        raise argparse.ArgumentTypeError("rf profile must be one of D0, D1, D2, D3")
    return aliases[normalized]


def build_transport(args: argparse.Namespace) -> BaseTransport:
    if args.transport == "tcp":
        return TcpTransport(args.host, args.port, connect_timeout=args.connect_timeout)
    return SerialTransport(args.device, args.baud, timeout=args.timeout)


def run_reader_client(args: argparse.Namespace, fn: Callable[[ReaderClient], object]) -> int:
    transport = build_transport(args)
    client = ReaderClient(transport=transport, read_id=args.read_id, debug=args.debug)
    try:
        result = fn(client)
        if result is not None:
            if hasattr(result, "__dataclass_fields__"):
                print_json(asdict(result))
            elif isinstance(result, (dict, list)):
                print_json(result)
            else:
                print(result)
        return 0
    finally:
        client.close()


def command_inventory(args: argparse.Namespace) -> int:
    transport = build_transport(args)
    client = ReaderClient(transport=transport, read_id=args.read_id, debug=args.debug)
    seen: dict[str, InventoryTag] = {}
    try:
        cycles = max(1, args.cycles)
        for _ in range(cycles):
            tags, summary = client.inventory_once(rounds=args.rounds, timeout=args.timeout, read_phase=args.phase)
            for tag in tags:
                seen[tag.epc] = tag
                if not args.quiet:
                    print(f"EPC={tag.epc} RSSI={tag.rssi_dbm}dBm ANT={tag.antenna} FREQ={tag.frequency_mhz:.2f}MHz")
            if summary and not args.quiet:
                print(f"summary: antenna_id={summary['antenna_id']} read_rate={summary['read_rate']} total_read={summary['total_read']}")
            if args.pause > 0:
                time.sleep(args.pause)
        if args.json:
            print_json({"unique_tags": [asdict(tag) for tag in seen.values()], "count": len(seen)})
        elif args.quiet:
            for tag in seen.values():
                print(tag.epc)
        return 0
    finally:
        client.close()


def command_firmware(args: argparse.Namespace) -> int:
    transport = build_transport(args)
    client = ReaderClient(transport=transport, read_id=args.read_id, debug=args.debug)
    try:
        print(client.get_firmware_version(timeout=args.timeout))
        return 0
    finally:
        client.close()


def command_temperature(args: argparse.Namespace) -> int:
    transport = build_transport(args)
    client = ReaderClient(transport=transport, read_id=args.read_id, debug=args.debug)
    try:
        print(client.get_temperature(timeout=args.timeout))
        return 0
    finally:
        client.close()


def command_identifier(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_identifier(timeout=args.timeout))


def command_reader_session_info(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_session_info(timeout=args.timeout))


def command_reader_antenna_get(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_work_antenna(timeout=args.timeout))


def command_reader_antenna_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.set_work_antenna(args.antenna, timeout=args.timeout))


def command_reader_power_get(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_output_power_config(timeout=args.timeout))


def command_reader_power_set(args: argparse.Namespace) -> int:
    power = [args.ant1, args.ant2, args.ant3, args.ant4] if args.ant1 is not None else args.power
    return run_reader_client(args, lambda client: client.set_output_power(power, timeout=args.timeout))


def command_reader_power_temp_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.set_temporary_output_power(args.power, timeout=args.timeout))


def command_reader_region_get(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_frequency_region(timeout=args.timeout))


def command_reader_region_set(args: argparse.Namespace) -> int:
    if args.region == 0x04:
        return run_reader_client(
            args,
            lambda client: client.set_frequency_region(
                args.region,
                freq_space_khz=args.freq_space_khz,
                freq_quantity=args.freq_quantity,
                start_freq_khz=args.start_freq_khz,
                timeout=args.timeout,
            ),
        )
    return run_reader_client(
        args,
        lambda client: client.set_frequency_region(
            args.region,
            start_freq=args.start_freq,
            end_freq=args.end_freq,
            timeout=args.timeout,
        ),
    )


def command_reader_baud_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.set_uart_baudrate(args.new_baud, timeout=args.timeout))


def command_reader_identifier_get(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: {"identifier_hex": client.get_identifier(timeout=args.timeout).replace(" ", "")})


def command_reader_identifier_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: {"identifier_hex": client.set_reader_identifier(args.identifier, timeout=args.timeout).replace(" ", "")})


def command_reader_beeper_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.set_beeper_mode(args.mode, timeout=args.timeout))


def command_reader_ant_detector_get(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_ant_connection_detector(timeout=args.timeout))


def command_reader_ant_detector_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.set_ant_connection_detector(args.sensitivity, timeout=args.timeout))


def command_reader_rf_link_get(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.get_rf_link_profile(timeout=args.timeout))


def command_reader_rf_link_set(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.set_rf_link_profile(args.profile, timeout=args.timeout))


def command_reader_return_loss(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: {"frequency_index": args.freq_parameter, "return_loss_db": client.get_rf_port_return_loss(args.freq_parameter, timeout=args.timeout)})


def command_reader_gpio_read(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.read_gpio_value(timeout=args.timeout))


def command_reader_gpio_write(args: argparse.Namespace) -> int:
    return run_reader_client(args, lambda client: client.write_gpio_value(args.gpio, bool(args.value), timeout=args.timeout))


def command_net_scan(args: argparse.Namespace) -> int:
    client = NetPortClient(bind_ip=args.bind_ip, debug=args.debug)
    results = client.search(duration=args.seconds)
    if args.json:
        print_json([{"source_ip": item.source_ip, **asdict(item.packet)} for item in results])
    else:
        for item in results:
            dev = item.packet.found_device
            if dev is None:
                continue
            print(
                f"{dev.name} ip={dev.ip} mac={item.packet.device_mac} ver={dev.version} "
                f"pc_mac={item.packet.pc_mac} source={item.source_ip}"
            )
    return 0


def command_net_get(args: argparse.Namespace) -> int:
    client = NetPortClient(bind_ip=args.bind_ip, debug=args.debug)
    packet = client.get(args.device_mac, timeout=args.timeout)
    print_json(asdict(packet))
    return 0


def command_cfg_decode(args: argparse.Namespace) -> int:
    if args.file:
        raw_text = Path(args.file).read_text(encoding="utf-8", errors="ignore")
        raw = from_hex(raw_text)
    else:
        raw = from_hex(args.hex)
    packet = parse_net_comm(raw)
    print_json(asdict(packet))
    return 0


def add_transport_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--read-id", default="FF", type=parse_read_id, help="reader address in hex, default FF")
    parser.add_argument("--timeout", default=3.0, type=float, help="read timeout in seconds")
    parser.add_argument("--debug", action="store_true", help="print raw frames to stderr")
    parser.add_argument("--transport", choices=["tcp", "serial"], required=True)
    parser.add_argument("--host", help="reader IP for TCP mode")
    parser.add_argument("--port", type=int, default=4001, help="reader port for TCP mode")
    parser.add_argument("--connect-timeout", type=float, default=2.0, help="TCP connect timeout in seconds")
    parser.add_argument("--device", help="serial device for serial mode, e.g. /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200, help="serial baudrate")


def validate_transport_args(args: argparse.Namespace) -> None:
    if args.transport == "tcp":
        if not args.host:
            raise RfidError("--host is required when --transport tcp")
    elif not args.device:
        raise RfidError("--device is required when --transport serial")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Portable helper for the vendor RFID reader SDK")
    sub = parser.add_subparsers(dest="command", required=True)

    inventory = sub.add_parser("inventory", help="run realtime inventory and print EPCs")
    add_transport_args(inventory)
    inventory.add_argument("--rounds", type=int, default=1, help="vendor inventory round value")
    inventory.add_argument("--cycles", type=int, default=1, help="how many inventory commands to issue")
    inventory.add_argument("--pause", type=float, default=0.0, help="delay between cycles")
    inventory.add_argument("--phase", action="store_true", help="parse phase bytes if the reader sends them")
    inventory.add_argument("--quiet", action="store_true", help="print EPC only")
    inventory.add_argument("--json", action="store_true", help="print JSON output")
    inventory.set_defaults(func=command_inventory)

    firmware = sub.add_parser("firmware", help="read firmware version")
    add_transport_args(firmware)
    firmware.set_defaults(func=command_firmware)

    temperature = sub.add_parser("temperature", help="read reader temperature")
    add_transport_args(temperature)
    temperature.set_defaults(func=command_temperature)

    identifier = sub.add_parser("identifier", help="read reader identifier")
    add_transport_args(identifier)
    identifier.set_defaults(func=command_identifier)

    reader_session = sub.add_parser("reader-session-info", help="read extended reader state over serial/TCP")
    add_transport_args(reader_session)
    reader_session.set_defaults(func=command_reader_session_info)

    reader_antenna_get = sub.add_parser("reader-antenna-get", help="read current work antenna")
    add_transport_args(reader_antenna_get)
    reader_antenna_get.set_defaults(func=command_reader_antenna_get)

    reader_antenna_set = sub.add_parser("reader-antenna-set", help="set current work antenna")
    add_transport_args(reader_antenna_set)
    reader_antenna_set.add_argument("--antenna", required=True, type=parse_antenna, help="persisted reader setting")
    reader_antenna_set.set_defaults(func=command_reader_antenna_set)

    reader_power_get = sub.add_parser("reader-power-get", help="read output power")
    add_transport_args(reader_power_get)
    reader_power_get.set_defaults(func=command_reader_power_get)

    reader_power_set = sub.add_parser("reader-power-set", help="set persisted output power in flash")
    add_transport_args(reader_power_set)
    power_group = reader_power_set.add_mutually_exclusive_group(required=True)
    power_group.add_argument("--power", type=parse_power, help="apply one value to all antennas")
    power_group.add_argument("--per-antenna", action="store_true", help="set per-antenna values with --ant1..--ant4")
    reader_power_set.add_argument("--ant1", type=parse_power, help="antenna 1 power")
    reader_power_set.add_argument("--ant2", type=parse_power, help="antenna 2 power")
    reader_power_set.add_argument("--ant3", type=parse_power, help="antenna 3 power")
    reader_power_set.add_argument("--ant4", type=parse_power, help="antenna 4 power")
    reader_power_set.set_defaults(func=command_reader_power_set)

    reader_power_temp_set = sub.add_parser("reader-power-temp-set", help="set temporary output power without saving to flash")
    add_transport_args(reader_power_temp_set)
    reader_power_temp_set.add_argument("--power", required=True, type=parse_temp_power, help="temporary power between 20 and 33 dBm")
    reader_power_temp_set.set_defaults(func=command_reader_power_temp_set)

    reader_region_get = sub.add_parser("reader-region-get", help="read frequency region")
    add_transport_args(reader_region_get)
    reader_region_get.set_defaults(func=command_reader_region_get)

    reader_region_set = sub.add_parser("reader-region-set", help="set persisted frequency region")
    add_transport_args(reader_region_set)
    reader_region_set.add_argument("--region", required=True, type=parse_region, help="FCC, ETSI, CHN or CUSTOM")
    reader_region_set.add_argument("--start-freq", type=int, help="system region start frequency parameter")
    reader_region_set.add_argument("--end-freq", type=int, help="system region end frequency parameter")
    reader_region_set.add_argument("--freq-space-khz", type=int, help="custom region spacing in KHz")
    reader_region_set.add_argument("--freq-quantity", type=int, help="custom region quantity")
    reader_region_set.add_argument("--start-freq-khz", type=int, help="custom region start frequency in KHz")
    reader_region_set.set_defaults(func=command_reader_region_set)

    reader_baud_set = sub.add_parser("reader-baud-set", help="set persisted UART baudrate and reset reader")
    add_transport_args(reader_baud_set)
    reader_baud_set.add_argument("--new-baud", required=True, type=parse_baudrate, help="38400 or 115200; this resets the reader")
    reader_baud_set.set_defaults(func=command_reader_baud_set)

    reader_identifier_get = sub.add_parser("reader-identifier-get", help="read 12-byte reader identifier")
    add_transport_args(reader_identifier_get)
    reader_identifier_get.set_defaults(func=command_reader_identifier_get)

    reader_identifier_set = sub.add_parser("reader-identifier-set", help="set persisted 12-byte reader identifier")
    add_transport_args(reader_identifier_set)
    reader_identifier_set.add_argument("--identifier", required=True, type=parse_identifier_hex, help="24 hex chars / 12 bytes")
    reader_identifier_set.set_defaults(func=command_reader_identifier_set)

    reader_beeper_set = sub.add_parser("reader-beeper-set", help="set persisted beeper mode")
    add_transport_args(reader_beeper_set)
    reader_beeper_set.add_argument("--mode", required=True, type=parse_beeper_mode, help="quiet, inventory, tag")
    reader_beeper_set.set_defaults(func=command_reader_beeper_set)

    reader_ant_detector_get = sub.add_parser("reader-ant-detector-get", help="read antenna detector sensitivity")
    add_transport_args(reader_ant_detector_get)
    reader_ant_detector_get.set_defaults(func=command_reader_ant_detector_get)

    reader_ant_detector_set = sub.add_parser("reader-ant-detector-set", help="set antenna detector sensitivity; 0 disables")
    add_transport_args(reader_ant_detector_set)
    reader_ant_detector_set.add_argument("--sensitivity", required=True, type=int, help="0 disables, otherwise dB threshold")
    reader_ant_detector_set.set_defaults(func=command_reader_ant_detector_set)

    reader_rf_link_get = sub.add_parser("reader-rf-link-get", help="read RF link profile")
    add_transport_args(reader_rf_link_get)
    reader_rf_link_get.set_defaults(func=command_reader_rf_link_get)

    reader_rf_link_set = sub.add_parser("reader-rf-link-set", help="set persisted RF link profile; reader resets")
    add_transport_args(reader_rf_link_set)
    reader_rf_link_set.add_argument("--profile", required=True, type=parse_rf_profile, help="D0, D1, D2 or D3")
    reader_rf_link_set.set_defaults(func=command_reader_rf_link_set)

    reader_return_loss = sub.add_parser("reader-return-loss", help="read return loss for current antenna at a frequency index")
    add_transport_args(reader_return_loss)
    reader_return_loss.add_argument("--freq-parameter", required=True, type=int, help="frequency parameter from the manual table")
    reader_return_loss.set_defaults(func=command_reader_return_loss)

    reader_gpio_read = sub.add_parser("reader-gpio-read", help="read GPIO1 and GPIO2 levels")
    add_transport_args(reader_gpio_read)
    reader_gpio_read.set_defaults(func=command_reader_gpio_read)

    reader_gpio_write = sub.add_parser("reader-gpio-write", help="set GPIO3 or GPIO4 level")
    add_transport_args(reader_gpio_write)
    reader_gpio_write.add_argument("--gpio", required=True, type=int, choices=[3, 4], help="GPIO output line")
    reader_gpio_write.add_argument("--value", required=True, type=int, choices=[0, 1], help="0=low, 1=high")
    reader_gpio_write.set_defaults(func=command_reader_gpio_write)

    net_scan = sub.add_parser("net-scan", help="discover CH9121 NetPort modules")
    net_scan.add_argument("--bind-ip", required=True, help="local interface IP on the same subnet as the reader")
    net_scan.add_argument("--seconds", type=float, default=3.0, help="how long to scan")
    net_scan.add_argument("--json", action="store_true", help="print JSON output")
    net_scan.add_argument("--debug", action="store_true", help="print UDP payloads to stderr")
    net_scan.set_defaults(func=command_net_scan)

    net_get = sub.add_parser("net-get", help="read NetPort module configuration")
    net_get.add_argument("--bind-ip", required=True, help="local interface IP on the same subnet as the reader")
    net_get.add_argument("--device-mac", required=True, help="reader NetPort MAC address")
    net_get.add_argument("--timeout", type=float, default=3.0, help="how long to wait for the response")
    net_get.add_argument("--debug", action="store_true", help="print UDP payloads to stderr")
    net_get.set_defaults(func=command_net_get)

    cfg = sub.add_parser("cfg-decode", help="decode a saved NetPort .cfg hex file")
    cfg_src = cfg.add_mutually_exclusive_group(required=True)
    cfg_src.add_argument("--file", help="path to a saved .cfg file")
    cfg_src.add_argument("--hex", help="raw config hex string")
    cfg.set_defaults(func=command_cfg_decode)

    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command not in {"net-scan", "net-get", "cfg-decode"}:
        validate_transport_args(args)
        if args.command == "reader-power-set" and args.per_antenna:
            if None in {args.ant1, args.ant2, args.ant3, args.ant4}:
                raise RfidError("--ant1 --ant2 --ant3 --ant4 are required with --per-antenna")
        if args.command == "reader-region-set":
            if args.region == 0x04:
                if args.start_freq is not None or args.end_freq is not None:
                    raise RfidError("--start-freq/--end-freq are only valid for system regions")
                if None in {args.freq_space_khz, args.freq_quantity, args.start_freq_khz}:
                    raise RfidError("custom region requires --freq-space-khz --freq-quantity and --start-freq-khz")
            else:
                if any(value is not None for value in {args.freq_space_khz, args.freq_quantity, args.start_freq_khz}):
                    raise RfidError("custom frequency flags are only valid for --region CUSTOM")
                if None in {args.start_freq, args.end_freq}:
                    raise RfidError("system region requires --start-freq and --end-freq")
    try:
        return args.func(args)
    except (RfidError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
