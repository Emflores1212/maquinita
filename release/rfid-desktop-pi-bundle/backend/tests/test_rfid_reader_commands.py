from __future__ import annotations

from pathlib import Path

import pytest

from rfid_runtime.controller import RfidController
from rfid_tools.rfid_cli import MessageFrame, ReaderClient, ReaderRegionConfig, RfidError


class FakeTransport:
    def __init__(self, responses: list[bytes] | None = None) -> None:
        self.responses = list(responses or [])
        self.sent: list[bytes] = []
        self.closed = False

    def send(self, payload: bytes) -> None:
        self.sent.append(payload)

    def recv(self, _timeout: float) -> bytes:
        if self.responses:
            return self.responses.pop(0)
        return b""

    def close(self) -> None:
        self.closed = True


def encode_frame(cmd: int, data: bytes = b"", read_id: int = 0xFF) -> bytes:
    return MessageFrame(read_id=read_id, cmd=cmd, data=data).encode()


def test_reader_region_get_parses_system_region() -> None:
    transport = FakeTransport([encode_frame(0x79, bytes([0x01, 0x07, 0x3B]))])
    client = ReaderClient(transport=transport, read_id=0xFF)

    result = client.get_frequency_region()

    assert isinstance(result, ReaderRegionConfig)
    assert result.mode == 'system'
    assert result.region_name == 'FCC'
    assert result.start_freq == 0x07
    assert result.end_freq == 0x3B


def test_reader_power_set_per_antenna_sends_expected_payload() -> None:
    transport = FakeTransport([encode_frame(0x76, bytes([0x10]))])
    client = ReaderClient(transport=transport, read_id=0xFF)

    result = client.set_output_power([30, 29, 28, 27])

    assert result.per_antenna == [30, 29, 28, 27]
    assert transport.sent[0] == encode_frame(0x76, bytes([30, 29, 28, 27]))


def test_reader_identifier_set_rejects_wrong_length() -> None:
    client = ReaderClient(transport=FakeTransport([]), read_id=0xFF)

    with pytest.raises(RfidError):
        client.set_reader_identifier('AABBCC')


def test_controller_reconnects_after_baud_change() -> None:
    first_transport = FakeTransport([encode_frame(0x71, bytes([0x04]))])
    second_transport = FakeTransport([])
    transports = [first_transport, second_transport]

    controller = RfidController()
    controller._build_transport = lambda config: transports.pop(0)  # type: ignore[method-assign]
    controller.connect(
        {
            'transport': 'serial',
            'device': '/dev/ttyUSB0',
            'baud': 115200,
            'readId': 'FF',
            'timeout': 3.0,
        }
    )

    result = controller.reader_set_uart_baudrate(38400)

    assert result['reconnected'] is True
    assert result['previous_baudrate'] == 115200
    assert controller.connected is True
    assert controller.connection is not None
    assert controller.connection['baud'] == 38400
    assert first_transport.closed is True
