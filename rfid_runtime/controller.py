from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional

from rfid_tools import (
    BEEPER_MODE_NAMES,
    RF_LINK_PROFILE_NAMES,
    REGION_NAMES,
    DeviceHwConfig,
    DevicePortConfig,
    NetPortClient,
    ReaderClient,
    ReaderBeeperConfig,
    ReaderDetectorConfig,
    ReaderGpioState,
    ReaderPowerConfig,
    ReaderRegionConfig,
    ReaderRfLinkProfile,
    RfidError,
    SERIAL_AVAILABLE,
    SerialTransport,
    TcpTransport,
    build_cfg_blob,
    from_hex,
    list_serial_ports,
    parse_net_comm,
    parse_read_id,
    to_hex,
)

EventCallback = Callable[[dict[str, Any]], None]


class RfidController:
    def __init__(self, event_callback: Optional[EventCallback] = None) -> None:
        self.session_lock = threading.RLock()
        self.command_lock = threading.Lock()
        self.client: Optional[ReaderClient] = None
        self.connection: Optional[dict[str, Any]] = None
        self.connected = False
        self.last_error: Optional[str] = None
        self.inventory_running = False
        self.inventory_request: Optional[dict[str, Any]] = None
        self.inventory_thread: Optional[threading.Thread] = None
        self.inventory_stop_event = threading.Event()
        self.snapshot: dict[str, dict[str, Any]] = {}
        self.log_buffer: deque[dict[str, Any]] = deque(maxlen=400)
        self.event_callback = event_callback

    def set_event_callback(self, callback: Optional[EventCallback]) -> None:
        self.event_callback = callback

    def _emit(self, event_type: str, payload: dict[str, Any]) -> None:
        if self.event_callback is None:
            return
        self.event_callback(
            {
                'type': event_type,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'payload': payload,
            }
        )

    def _log_callback(self, prefix: str, payload: bytes) -> None:
        entry = {
            'direction': prefix,
            'hex': to_hex(payload, ' '),
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        self.log_buffer.appendleft(entry)
        self._emit('log', entry)

    @staticmethod
    def _value(source: Mapping[str, Any], key: str, default: Any = None) -> Any:
        return source[key] if key in source else default

    def _build_transport(self, config: Mapping[str, Any]):
        if self._value(config, 'transport') == 'tcp':
            return TcpTransport(
                str(self._value(config, 'host', '')),
                int(self._value(config, 'port', 4001)),
                connect_timeout=float(self._value(config, 'connectTimeout', 2.0) or 2.0),
            )
        return SerialTransport(
            str(self._value(config, 'device', '')),
            int(self._value(config, 'baud', 115200)),
            timeout=float(self._value(config, 'timeout', 3.0)),
        )

    def _ensure_client(self) -> ReaderClient:
        if self.client is None or not self.connected:
            raise RfidError('No hay una sesión RFID activa')
        return self.client

    def get_capabilities(self) -> dict[str, Any]:
        return {
            'serial_supported': SERIAL_AVAILABLE,
            'serial_ports_detected': [asdict(port) for port in list_serial_ports()],
            'transports': ['tcp', 'serial'],
            'actions': {
                'reader_info': True,
                'inventory': True,
                'tag_ops': True,
                'netport': True,
                'cfg_encode_decode': True,
            },
        }

    def get_state(self) -> dict[str, Any]:
        return {
            'connected': self.connected,
            'inventory_running': self.inventory_running,
            'active_transport': self.connection.get('transport') if self.connection else None,
            'read_id': self.connection.get('readId') if self.connection else None,
            'connection': dict(self.connection) if self.connection else None,
            'last_error': self.last_error,
            'operation_in_progress': self.command_lock.locked(),
            'snapshot_count': len(self.snapshot),
        }

    def connect(self, config: Mapping[str, Any]) -> dict[str, Any]:
        self.disconnect()
        config_dict = dict(config)
        with self.session_lock:
            try:
                transport = self._build_transport(config_dict)
                self.client = ReaderClient(
                    transport=transport,
                    read_id=parse_read_id(str(self._value(config_dict, 'readId', 'FF'))),
                    log_callback=self._log_callback,
                )
                self.connection = config_dict
                self.connected = True
                self.last_error = None
                self._emit('connection', {'connected': True, 'transport': config_dict.get('transport'), 'readId': config_dict.get('readId')})
            except Exception as exc:
                self.client = None
                self.connection = None
                self.connected = False
                self.last_error = str(exc)
                self._emit('error', {'message': self.last_error})
                raise
        return self.get_state()

    def disconnect(self) -> dict[str, Any]:
        self.inventory_stop()
        with self.session_lock:
            client = self.client
            self.client = None
            self.connected = False
            self.connection = None
            self.snapshot.clear()
            if client is not None:
                client.close()
        self._emit('connection', {'connected': False, 'inventory_running': False})
        return self.get_state()

    def serial_ports(self) -> list[dict[str, Any]]:
        return [asdict(port) for port in list_serial_ports()]

    def _run_reader_call(self, fn_name: str, *args: Any, **kwargs: Any) -> Any:
        with self.command_lock:
            client = self._ensure_client()
            try:
                method = getattr(client, fn_name)
                result = method(*args, **kwargs)
                self.last_error = None
                return result
            except Exception as exc:
                self.last_error = str(exc)
                self._emit('error', {'message': self.last_error})
                raise

    def reader_firmware(self) -> dict[str, Any]:
        version = self._run_reader_call('get_firmware_version', timeout=float(self.connection.get('timeout', 2.0)) if self.connection else 2.0)
        return {'firmware': version}

    def reader_temperature(self) -> dict[str, Any]:
        value = self._run_reader_call('get_temperature', timeout=float(self.connection.get('timeout', 2.0)) if self.connection else 2.0)
        return {'temperature_c': value}

    def reader_identifier(self) -> dict[str, Any]:
        identifier = self._run_reader_call('get_identifier', timeout=float(self.connection.get('timeout', 2.0)) if self.connection else 2.0)
        return {'identifier_hex': identifier}

    def reader_output_power(self) -> dict[str, Any]:
        config = self._run_reader_call('get_output_power_config', timeout=float(self.connection.get('timeout', 2.0)) if self.connection else 2.0)
        return asdict(config)

    def reader_session_info(self) -> dict[str, Any]:
        info = self._run_reader_call('get_session_info', timeout=float(self.connection.get('timeout', 2.0)) if self.connection else 2.0)
        return asdict(info)

    def _current_timeout(self, default: float = 2.0) -> float:
        return float(self.connection.get('timeout', default)) if self.connection else default

    def _replace_client(self, config: Mapping[str, Any]) -> None:
        transport = self._build_transport(config)
        self.client = ReaderClient(
            transport=transport,
            read_id=parse_read_id(str(self._value(config, 'readId', 'FF'))),
            log_callback=self._log_callback,
        )

    def reader_get_work_antenna(self) -> dict[str, Any]:
        return asdict(self._run_reader_call('get_work_antenna', timeout=self._current_timeout()))

    def reader_set_work_antenna(self, antenna_id: int) -> dict[str, Any]:
        return asdict(self._run_reader_call('set_work_antenna', antenna_id, timeout=self._current_timeout()))

    def reader_get_output_power(self) -> dict[str, Any]:
        return asdict(self._run_reader_call('get_output_power_config', timeout=self._current_timeout()))

    def reader_set_output_power(self, power_dbm: int | list[int]) -> dict[str, Any]:
        return asdict(self._run_reader_call('set_output_power', power_dbm, timeout=self._current_timeout()))

    def reader_set_temporary_output_power(self, power_dbm: int) -> dict[str, Any]:
        return asdict(self._run_reader_call('set_temporary_output_power', power_dbm, timeout=self._current_timeout()))

    def reader_get_frequency_region(self) -> dict[str, Any]:
        return asdict(self._run_reader_call('get_frequency_region', timeout=self._current_timeout()))

    def reader_set_frequency_region(self, config: Mapping[str, Any]) -> dict[str, Any]:
        payload = dict(config)
        region_code = int(payload['region_code'])
        kwargs: dict[str, Any] = {'timeout': self._current_timeout()}
        for key in ('start_freq', 'end_freq', 'freq_space_khz', 'freq_quantity', 'start_freq_khz'):
            if key in payload and payload[key] is not None:
                kwargs[key] = int(payload[key])
        return asdict(self._run_reader_call('set_frequency_region', region_code, **kwargs))

    def reader_set_uart_baudrate(self, baudrate: int) -> dict[str, Any]:
        if not self.connection or self.connection.get('transport') != 'serial':
            raise RfidError('El cambio de baudrate solo está soportado en una sesión serial activa')
        with self.command_lock:
            client = self._ensure_client()
            timeout = self._current_timeout()
            result = client.set_uart_baudrate(baudrate, timeout=timeout)
            previous_baud = int(result.get('previous_baudrate') or self.connection.get('baud') or 0)
            new_connection = dict(self.connection)
            new_connection['baud'] = int(baudrate)
            try:
                client.close()
            finally:
                self.client = None
            time.sleep(0.8)
            try:
                self._replace_client(new_connection)
                self.connection = new_connection
                self.connected = True
                self.last_error = None
                self._emit('connection', {'connected': True, 'transport': 'serial', 'readId': new_connection.get('readId')})
            except Exception as exc:
                self.connected = False
                self.connection = new_connection
                self.last_error = f"Baudrate cambiado a {baudrate}, pero no se pudo reconectar automáticamente: {exc}"
                self._emit('error', {'message': self.last_error})
                raise RfidError(self.last_error) from exc
        return {
            'previous_baudrate': previous_baud,
            'baudrate': int(baudrate),
            'reconnected': True,
        }

    def reader_identifier_get(self) -> dict[str, Any]:
        identifier = self._run_reader_call('get_identifier', timeout=self._current_timeout())
        return {'identifier_hex': identifier.replace(' ', '')}

    def reader_identifier_set(self, identifier_hex: str) -> dict[str, Any]:
        identifier = self._run_reader_call('set_reader_identifier', identifier_hex, timeout=self._current_timeout())
        return {'identifier_hex': identifier.replace(' ', '')}

    def reader_set_beeper_mode(self, mode: int) -> dict[str, Any]:
        return asdict(self._run_reader_call('set_beeper_mode', mode, timeout=self._current_timeout()))

    def reader_get_ant_connection_detector(self) -> dict[str, Any]:
        return asdict(self._run_reader_call('get_ant_connection_detector', timeout=self._current_timeout()))

    def reader_set_ant_connection_detector(self, sensitivity_db: int) -> dict[str, Any]:
        return asdict(self._run_reader_call('set_ant_connection_detector', sensitivity_db, timeout=self._current_timeout()))

    def reader_get_rf_link_profile(self) -> dict[str, Any]:
        return asdict(self._run_reader_call('get_rf_link_profile', timeout=self._current_timeout()))

    def reader_set_rf_link_profile(self, profile_id: int) -> dict[str, Any]:
        with self.command_lock:
            client = self._ensure_client()
            result = client.set_rf_link_profile(profile_id, timeout=self._current_timeout())
            time.sleep(0.8)
        return asdict(result)

    def reader_get_rf_port_return_loss(self, freq_parameter: int) -> dict[str, Any]:
        value = self._run_reader_call('get_rf_port_return_loss', freq_parameter, timeout=self._current_timeout())
        return {'frequency_index': freq_parameter, 'return_loss_db': value}

    def reader_read_gpio(self) -> dict[str, Any]:
        return asdict(self._run_reader_call('read_gpio_value', timeout=self._current_timeout()))

    def reader_write_gpio(self, gpio: int, value: bool) -> dict[str, Any]:
        return self._run_reader_call('write_gpio_value', gpio, value, timeout=self._current_timeout())

    def _merge_tags(self, tags: list[Any]) -> list[dict[str, Any]]:
        merged: list[dict[str, Any]] = []
        for tag in tags:
            now = datetime.now(timezone.utc).isoformat()
            current = self.snapshot.get(tag.epc)
            if current is None:
                current = {
                    'epc': tag.epc,
                    'pc': tag.pc,
                    'rssi_dbm': tag.rssi_dbm,
                    'antenna': tag.antenna,
                    'frequency_mhz': tag.frequency_mhz,
                    'phase': tag.phase,
                    'count': 1,
                    'updated_at': now,
                }
            else:
                current.update(
                    {
                        'pc': tag.pc,
                        'rssi_dbm': tag.rssi_dbm,
                        'antenna': tag.antenna,
                        'frequency_mhz': tag.frequency_mhz,
                        'phase': tag.phase,
                        'count': int(current['count']) + 1,
                        'updated_at': now,
                    }
                )
            self.snapshot[tag.epc] = current
            merged.append(dict(current))
        return merged

    def _inventory_worker(self) -> None:
        request = dict(self.inventory_request or {})
        timeout = max(float(self.connection.get('timeout', 3.0)) if self.connection else 3.0, 4.0)
        try:
            while self.inventory_running and not self.inventory_stop_event.is_set():
                with self.command_lock:
                    client = self._ensure_client()
                    tags, summary = client.inventory_once(
                        int(request.get('rounds', 1)),
                        timeout,
                        bool(request.get('readPhase', False)),
                    )
                for payload in self._merge_tags(tags):
                    self._emit('inventory_tag', payload)
                if summary is not None:
                    self._emit('inventory_summary', summary)
                if not bool(request.get('continuous', True)):
                    break
                self.inventory_stop_event.wait(float(request.get('intervalMs', 400)) / 1000)
        except Exception as exc:
            self.last_error = str(exc)
            self._emit('error', {'message': self.last_error})
        finally:
            self.inventory_running = False
            self.inventory_thread = None
            self.inventory_stop_event.clear()
            self._emit('connection', {'connected': self.connected, 'inventory_running': False})

    def start_inventory(self, request: Mapping[str, Any]) -> dict[str, Any]:
        self._ensure_client()
        if self.inventory_running:
            raise RfidError('Ya hay un inventario corriendo')
        self.snapshot.clear()
        self.inventory_request = dict(request)
        self.inventory_running = True
        self.inventory_stop_event.clear()
        self.inventory_thread = threading.Thread(target=self._inventory_worker, name='rfid-inventory', daemon=True)
        self.inventory_thread.start()
        self._emit('connection', {'connected': True, 'inventory_running': True})
        return self.get_state()

    def inventory_stop(self) -> dict[str, Any]:
        self.inventory_running = False
        self.inventory_stop_event.set()
        if self.inventory_thread and self.inventory_thread.is_alive() and self.inventory_thread is not threading.current_thread():
            self.inventory_thread.join(timeout=1.0)
        self.inventory_thread = None
        return self.get_state()

    def get_snapshot(self) -> list[dict[str, Any]]:
        return sorted((dict(item) for item in self.snapshot.values()), key=lambda item: item['updated_at'], reverse=True)

    def tag_read(self, password_hex: str, mem_bank: int, word_address: int, word_count: int) -> dict[str, Any]:
        result = self._run_reader_call('read_tag', mem_bank, word_address, word_count, password_hex, float(self.connection.get('timeout', 3.0)) if self.connection else 3.0)
        return asdict(result)

    def tag_write(self, password_hex: str, mem_bank: int, word_address: int, data_hex: str) -> dict[str, Any]:
        result = self._run_reader_call('write_tag', mem_bank, word_address, data_hex, password_hex, float(self.connection.get('timeout', 3.0)) if self.connection else 3.0)
        return asdict(result)

    def tag_lock(self, password_hex: str, mem_bank: int, lock_type: int) -> dict[str, Any]:
        result = self._run_reader_call('lock_tag', mem_bank, lock_type, password_hex, float(self.connection.get('timeout', 3.0)) if self.connection else 3.0)
        return asdict(result)

    def tag_kill(self, password_hex: str) -> dict[str, Any]:
        result = self._run_reader_call('kill_tag', password_hex, float(self.connection.get('timeout', 3.0)) if self.connection else 3.0)
        return asdict(result)

    def access_match_get(self) -> dict[str, Any]:
        result = self._run_reader_call('get_access_epc_match', timeout=float(self.connection.get('timeout', 3.0)) if self.connection else 3.0)
        return asdict(result)

    def access_match_set(self, epc_hex: str, mode: int = 0) -> dict[str, Any]:
        self._run_reader_call('set_access_epc_match', epc_hex, float(self.connection.get('timeout', 3.0)) if self.connection else 3.0, mode)
        return {'enabled': True, 'epc_hex': epc_hex}

    def access_match_clear(self) -> dict[str, Any]:
        self._run_reader_call('clear_access_epc_match', timeout=float(self.connection.get('timeout', 3.0)) if self.connection else 3.0)
        return {'enabled': False}

    @staticmethod
    def _to_hw_config(model: Mapping[str, Any]) -> DeviceHwConfig:
        return DeviceHwConfig(**dict(model))

    @staticmethod
    def _to_port_config(model: Mapping[str, Any]) -> DevicePortConfig:
        return DevicePortConfig(**dict(model))

    def net_scan(self, bind_ip: str, seconds: float) -> list[dict[str, Any]]:
        with self.command_lock:
            client = NetPortClient(bind_ip, log_callback=self._log_callback)
            results = client.search(seconds)
        payloads = [{'source_ip': item.source_ip, **asdict(item.packet)} for item in results]
        for payload in payloads:
            self._emit('netport_scan_result', payload)
        return payloads

    def net_get(self, bind_ip: str, device_mac: str, timeout: float) -> dict[str, Any]:
        with self.command_lock:
            client = NetPortClient(bind_ip, log_callback=self._log_callback)
            packet = client.get(device_mac, timeout)
        return asdict(packet)

    def net_set(
        self,
        bind_ip: str,
        device_mac: str,
        pc_mac: str,
        hw_config: Mapping[str, Any],
        port0: Mapping[str, Any],
        port1: Mapping[str, Any],
        timeout: float,
    ) -> dict[str, Any]:
        with self.command_lock:
            client = NetPortClient(bind_ip, log_callback=self._log_callback)
            packet = client.set(device_mac, pc_mac, self._to_hw_config(hw_config), self._to_port_config(port0), self._to_port_config(port1), timeout)
        return asdict(packet)

    def net_reset(self, bind_ip: str, device_mac: str, timeout: float) -> dict[str, Any]:
        with self.command_lock:
            client = NetPortClient(bind_ip, log_callback=self._log_callback)
            packet = client.reset(device_mac, timeout)
        return asdict(packet)

    def net_default(self, bind_ip: str, device_mac: str, pc_mac: str, timeout: float) -> dict[str, Any]:
        with self.command_lock:
            client = NetPortClient(bind_ip, log_callback=self._log_callback)
            packet = client.restore_default(device_mac, pc_mac, timeout)
        return asdict(packet)

    def cfg_decode(self, hex_text: str) -> dict[str, Any]:
        packet = parse_net_comm(from_hex(hex_text))
        return asdict(packet)

    def cfg_encode(
        self,
        pc_mac: str,
        hw_config: Mapping[str, Any],
        port0: Mapping[str, Any],
        port1: Mapping[str, Any],
        device_mac: str,
    ) -> dict[str, Any]:
        blob = build_cfg_blob(pc_mac, self._to_hw_config(hw_config), self._to_port_config(port0), self._to_port_config(port1), device_mac)
        return {'hex': to_hex(blob), 'byte_length': len(blob)}

    def get_logs(self) -> list[dict[str, Any]]:
        return list(self.log_buffer)
