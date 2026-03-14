from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

from app.core.rfid_ws_manager import rfid_live_manager
from app.schemas.rfid import (
    ConnectionConfig,
    DeviceHwConfigModel,
    DevicePortConfigModel,
    InventoryRequest,
    SessionState,
)

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from rfid_runtime import RfidController  # noqa: E402


class RfidService:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.controller = RfidController(event_callback=self._emit_threadsafe)

    def _remember_loop(self) -> None:
        self.loop = asyncio.get_running_loop()

    def _emit_threadsafe(self, message: dict[str, Any]) -> None:
        if self.loop is None:
            return
        self.loop.call_soon_threadsafe(asyncio.create_task, rfid_live_manager.broadcast(message))

    @staticmethod
    def _state_model(data: dict[str, Any]) -> SessionState:
        connection = data.get('connection')
        return SessionState(
            connected=bool(data.get('connected', False)),
            inventory_running=bool(data.get('inventory_running', False)),
            active_transport=data.get('active_transport'),
            read_id=data.get('read_id'),
            connection=ConnectionConfig(**connection) if connection else None,
            last_error=data.get('last_error'),
            operation_in_progress=bool(data.get('operation_in_progress', False)),
            snapshot_count=int(data.get('snapshot_count', 0)),
        )

    async def get_capabilities(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.get_capabilities)

    async def get_state(self) -> SessionState:
        self._remember_loop()
        return self._state_model(await asyncio.to_thread(self.controller.get_state))

    async def connect(self, config: ConnectionConfig) -> SessionState:
        self._remember_loop()
        data = await asyncio.to_thread(self.controller.connect, config.model_dump())
        return self._state_model(data)

    async def disconnect(self) -> SessionState:
        self._remember_loop()
        data = await asyncio.to_thread(self.controller.disconnect)
        return self._state_model(data)

    async def serial_ports(self) -> list[dict[str, Any]]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.serial_ports)

    async def reader_firmware(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.reader_firmware)

    async def reader_temperature(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.reader_temperature)

    async def reader_identifier(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.reader_identifier)

    async def reader_output_power(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.reader_output_power)

    async def reader_session_info(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.reader_session_info)

    async def inventory_start(self, request: InventoryRequest) -> SessionState:
        self._remember_loop()
        data = await asyncio.to_thread(self.controller.start_inventory, request.model_dump())
        return self._state_model(data)

    async def inventory_stop(self) -> SessionState:
        self._remember_loop()
        data = await asyncio.to_thread(self.controller.inventory_stop)
        return self._state_model(data)

    async def inventory_snapshot(self) -> list[dict[str, Any]]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.get_snapshot)

    async def tag_read(self, password_hex: str, mem_bank: int, word_address: int, word_count: int) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.tag_read, password_hex, mem_bank, word_address, word_count)

    async def tag_write(self, password_hex: str, mem_bank: int, word_address: int, data_hex: str) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.tag_write, password_hex, mem_bank, word_address, data_hex)

    async def tag_lock(self, password_hex: str, mem_bank: int, lock_type: int) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.tag_lock, password_hex, mem_bank, lock_type)

    async def tag_kill(self, password_hex: str) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.tag_kill, password_hex)

    async def access_match_get(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.access_match_get)

    async def access_match_set(self, epc_hex: str, mode: int = 0) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.access_match_set, epc_hex, mode)

    async def access_match_clear(self) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.access_match_clear)

    async def net_scan(self, bind_ip: str, seconds: float) -> list[dict[str, Any]]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.net_scan, bind_ip, seconds)

    async def net_get(self, bind_ip: str, device_mac: str, timeout: float) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.net_get, bind_ip, device_mac, timeout)

    async def net_set(self, bind_ip: str, device_mac: str, pc_mac: str, hw_config: DeviceHwConfigModel, port0: DevicePortConfigModel, port1: DevicePortConfigModel, timeout: float) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(
            self.controller.net_set,
            bind_ip,
            device_mac,
            pc_mac,
            hw_config.model_dump(),
            port0.model_dump(),
            port1.model_dump(),
            timeout,
        )

    async def net_reset(self, bind_ip: str, device_mac: str, timeout: float) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.net_reset, bind_ip, device_mac, timeout)

    async def net_default(self, bind_ip: str, device_mac: str, pc_mac: str, timeout: float) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.net_default, bind_ip, device_mac, pc_mac, timeout)

    async def cfg_decode(self, hex_text: str) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.cfg_decode, hex_text)

    async def cfg_encode(self, pc_mac: str, hw_config: DeviceHwConfigModel, port0: DevicePortConfigModel, port1: DevicePortConfigModel, device_mac: str) -> dict[str, Any]:
        self._remember_loop()
        return await asyncio.to_thread(
            self.controller.cfg_encode,
            pc_mac,
            hw_config.model_dump(),
            port0.model_dump(),
            port1.model_dump(),
            device_mac,
        )

    async def get_logs(self) -> list[dict[str, Any]]:
        self._remember_loop()
        return await asyncio.to_thread(self.controller.get_logs)


rfid_service = RfidService()
