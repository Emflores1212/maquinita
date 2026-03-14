from __future__ import annotations

import pytest

import rfid_runtime.controller as controller_module
from app.services.rfid_service import RfidService
from app.schemas.rfid import DeviceHwConfigModel, DevicePortConfigModel


def sample_hw() -> dict:
    return {
        'dev_type': 1,
        'aux_dev_type': 0,
        'index': 0,
        'hardware_version': 1,
        'software_version': 1,
        'module_name': 'NETPORT',
        'mac': '11:22:33:44:55:66',
        'ip': '192.168.1.200',
        'gateway': '192.168.1.1',
        'subnet_mask': '255.255.255.0',
        'dhcp_enabled': False,
        'web_port': 80,
        'username': 'admin',
        'password_enabled': False,
        'password': 'admin',
        'update_flag': False,
        'serial_config_enabled': True,
    }


def sample_port(index: int) -> dict:
    return {
        'index': index,
        'enabled': index == 0,
        'net_mode': 0,
        'random_source_port': False,
        'net_port': 4001 + index,
        'destination_ip': '192.168.1.50',
        'destination_port': 4001 + index,
        'baudrate': 115200,
        'data_bits': 8,
        'stop_bits': 1,
        'parity': 0,
        'phy_disconnect_handle': False,
        'rx_packet_length': 0,
        'rx_packet_timeout': 0,
        'reconnect_count': 0,
        'reset_ctrl': False,
        'dns_enabled': False,
        'domain_name': '',
        'dns_host_ip': '0.0.0.0',
        'dns_host_port': 0,
    }


@pytest.mark.asyncio
async def test_cfg_encode_decode_roundtrip() -> None:
    service = RfidService()
    encoded = await service.cfg_encode(
        pc_mac='AA:BB:CC:DD:EE:FF',
        hw_config=DeviceHwConfigModel(**sample_hw()),
        port0=DevicePortConfigModel(**sample_port(0)),
        port1=DevicePortConfigModel(**sample_port(1)),
        device_mac='11:22:33:44:55:66',
    )

    decoded = await service.cfg_decode(encoded['hex'])

    assert decoded['device_mac'] == '11:22:33:44:55:66'
    assert decoded['pc_mac'] == 'aa:bb:cc:dd:ee:ff'
    assert decoded['hw_config']['ip'] == '192.168.1.200'
    assert decoded['port0']['net_port'] == 4001
    assert decoded['port1']['net_port'] == 4002


@pytest.mark.asyncio
async def test_capabilities_uses_serial_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(controller_module, 'SERIAL_AVAILABLE', False)
    monkeypatch.setattr(controller_module, 'list_serial_ports', lambda: [])

    controller = controller_module.RfidController()
    capabilities = controller.get_capabilities()

    assert capabilities['serial_supported'] is False
    assert capabilities['serial_ports_detected'] == []
