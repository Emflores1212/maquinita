from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ConnectionConfig(BaseModel):
    transport: Literal['tcp', 'serial']
    host: Optional[str] = None
    port: Optional[int] = 4001
    device: Optional[str] = None
    baud: Optional[int] = 115200
    readId: str = 'FF'
    timeout: float = 3.0
    connectTimeout: Optional[float] = 2.0

    @model_validator(mode='after')
    def validate_transport_fields(self) -> 'ConnectionConfig':
        if self.transport == 'tcp' and not self.host:
            raise ValueError('host es requerido para transporte TCP')
        if self.transport == 'serial' and not self.device:
            raise ValueError('device es requerido para transporte serial')
        return self


class SessionState(BaseModel):
    connected: bool
    inventory_running: bool
    active_transport: Optional[str] = None
    read_id: Optional[str] = None
    connection: Optional[ConnectionConfig] = None
    last_error: Optional[str] = None
    operation_in_progress: bool = False
    snapshot_count: int = 0


class InventoryRequest(BaseModel):
    rounds: int = Field(default=1, ge=1, le=255)
    continuous: bool = True
    intervalMs: int = Field(default=400, ge=0, le=10000)
    readPhase: bool = False


class TagReadRequest(BaseModel):
    passwordHex: str = '00000000'
    memBank: int = Field(ge=0, le=3)
    wordAddress: int = Field(ge=0, le=255)
    wordCount: int = Field(ge=1, le=255)


class TagWriteRequest(BaseModel):
    passwordHex: str = '00000000'
    memBank: int = Field(ge=0, le=3)
    wordAddress: int = Field(ge=0, le=255)
    wordCount: Optional[int] = Field(default=None, ge=1, le=255)
    dataHex: str


class TagLockRequest(BaseModel):
    passwordHex: str = '00000000'
    memBank: int = Field(ge=0, le=5)
    lockType: int = Field(ge=0, le=3)


class TagKillRequest(BaseModel):
    passwordHex: str = '00000000'


class AccessMatchSetRequest(BaseModel):
    epcHex: str
    mode: int = Field(default=0, ge=0, le=255)


class NetPortScanRequest(BaseModel):
    bindIp: str
    seconds: float = Field(default=3.0, ge=0.5, le=30.0)


class DeviceHwConfigModel(BaseModel):
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


class DevicePortConfigModel(BaseModel):
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


class NetPortGetRequest(BaseModel):
    bindIp: str
    deviceMac: str
    timeout: float = Field(default=3.0, ge=0.5, le=30.0)


class NetPortSetRequest(BaseModel):
    bindIp: str
    deviceMac: str
    pcMac: str
    hwConfig: DeviceHwConfigModel
    port0: DevicePortConfigModel
    port1: DevicePortConfigModel
    timeout: float = Field(default=3.0, ge=0.5, le=30.0)


class NetPortResetRequest(BaseModel):
    bindIp: str
    deviceMac: str
    timeout: float = Field(default=3.0, ge=0.5, le=30.0)


class NetPortDefaultRequest(BaseModel):
    bindIp: str
    deviceMac: str
    pcMac: str
    timeout: float = Field(default=3.0, ge=0.5, le=30.0)


class NetCfgEncodeRequest(BaseModel):
    pcMac: str
    hwConfig: DeviceHwConfigModel
    port0: DevicePortConfigModel
    port1: DevicePortConfigModel
    deviceMac: str = '11:22:33:44:55:66'


class NetCfgDecodeRequest(BaseModel):
    hex: Optional[str] = None


class ReaderSnapshotTag(BaseModel):
    epc: str
    pc: str
    rssi_dbm: int
    antenna: int
    frequency_mhz: float
    phase: Optional[str] = None
    count: int
    updated_at: datetime


class RfidWsEvent(BaseModel):
    type: Literal['connection', 'inventory_tag', 'inventory_summary', 'log', 'error', 'netport_scan_result']
    timestamp: datetime
    payload: dict[str, Any]


class ApiEnvelope(BaseModel):
    ok: bool = True
    message: Optional[str] = None
    data: Any = None

    model_config = ConfigDict(arbitrary_types_allowed=True)
