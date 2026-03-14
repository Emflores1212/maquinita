from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.core.rfid_ws_manager import rfid_live_manager
from app.schemas.rfid import (
    AccessMatchSetRequest,
    ApiEnvelope,
    ConnectionConfig,
    InventoryRequest,
    NetCfgEncodeRequest,
    NetPortDefaultRequest,
    NetPortGetRequest,
    NetPortResetRequest,
    NetPortScanRequest,
    NetPortSetRequest,
    TagKillRequest,
    TagLockRequest,
    TagReadRequest,
    TagWriteRequest,
)
from app.services.rfid_service import rfid_service

router = APIRouter()


@router.get('/api/v1/rfid/capabilities', response_model=ApiEnvelope)
async def get_capabilities() -> ApiEnvelope:
    return ApiEnvelope(data=await rfid_service.get_capabilities())


@router.get('/api/v1/rfid/serial/ports', response_model=ApiEnvelope)
async def list_serial() -> ApiEnvelope:
    return ApiEnvelope(data=await rfid_service.serial_ports())


@router.post('/api/v1/rfid/session/connect', response_model=ApiEnvelope)
async def connect_session(config: ConnectionConfig) -> ApiEnvelope:
    try:
        return ApiEnvelope(message='Sesion RFID conectada', data=(await rfid_service.connect(config)).model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/session/disconnect', response_model=ApiEnvelope)
async def disconnect_session() -> ApiEnvelope:
    return ApiEnvelope(message='Sesion RFID desconectada', data=(await rfid_service.disconnect()).model_dump())


@router.get('/api/v1/rfid/session/state', response_model=ApiEnvelope)
async def session_state() -> ApiEnvelope:
    return ApiEnvelope(data=(await rfid_service.get_state()).model_dump())


@router.post('/api/v1/rfid/reader/firmware', response_model=ApiEnvelope)
async def reader_firmware() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.reader_firmware())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/reader/temperature', response_model=ApiEnvelope)
async def reader_temperature() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.reader_temperature())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/reader/identifier', response_model=ApiEnvelope)
async def reader_identifier() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.reader_identifier())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/reader/output-power/get', response_model=ApiEnvelope)
async def reader_output_power() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.reader_output_power())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/reader/session-info', response_model=ApiEnvelope)
async def reader_session_info() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.reader_session_info())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/inventory/start', response_model=ApiEnvelope)
async def inventory_start(request: InventoryRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(message='Inventario iniciado', data=(await rfid_service.inventory_start(request)).model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/inventory/stop', response_model=ApiEnvelope)
async def inventory_stop() -> ApiEnvelope:
    return ApiEnvelope(message='Inventario detenido', data=(await rfid_service.inventory_stop()).model_dump())


@router.get('/api/v1/rfid/inventory/snapshot', response_model=ApiEnvelope)
async def inventory_snapshot() -> ApiEnvelope:
    return ApiEnvelope(data=await rfid_service.inventory_snapshot())


@router.post('/api/v1/rfid/tag/read', response_model=ApiEnvelope)
async def tag_read(request: TagReadRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.tag_read(request.passwordHex, request.memBank, request.wordAddress, request.wordCount))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/tag/write', response_model=ApiEnvelope)
async def tag_write(request: TagWriteRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.tag_write(request.passwordHex, request.memBank, request.wordAddress, request.dataHex))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/tag/lock', response_model=ApiEnvelope)
async def tag_lock(request: TagLockRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.tag_lock(request.passwordHex, request.memBank, request.lockType))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/tag/kill', response_model=ApiEnvelope)
async def tag_kill(request: TagKillRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.tag_kill(request.passwordHex))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/tag/access-match/get', response_model=ApiEnvelope)
async def access_match_get() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.access_match_get())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/tag/access-match/set', response_model=ApiEnvelope)
async def access_match_set(request: AccessMatchSetRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.access_match_set(request.epcHex, request.mode))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/tag/access-match/clear', response_model=ApiEnvelope)
async def access_match_clear() -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.access_match_clear())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/scan', response_model=ApiEnvelope)
async def netport_scan(request: NetPortScanRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.net_scan(request.bindIp, request.seconds))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/get', response_model=ApiEnvelope)
async def netport_get(request: NetPortGetRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.net_get(request.bindIp, request.deviceMac, request.timeout))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/set', response_model=ApiEnvelope)
async def netport_set(request: NetPortSetRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.net_set(request.bindIp, request.deviceMac, request.pcMac, request.hwConfig, request.port0, request.port1, request.timeout))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/reset', response_model=ApiEnvelope)
async def netport_reset(request: NetPortResetRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.net_reset(request.bindIp, request.deviceMac, request.timeout))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/default', response_model=ApiEnvelope)
async def netport_default(request: NetPortDefaultRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.net_default(request.bindIp, request.deviceMac, request.pcMac, request.timeout))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/cfg/decode', response_model=ApiEnvelope)
async def net_cfg_decode(hex: str | None = Form(default=None), file: UploadFile | None = File(default=None)) -> ApiEnvelope:
    try:
        if file is not None:
            raw = (await file.read()).decode('utf-8', errors='ignore')
        elif hex:
            raw = hex
        else:
            raise HTTPException(status_code=400, detail='Se requiere hex o archivo .cfg')
        return ApiEnvelope(data=await rfid_service.cfg_decode(raw))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/v1/rfid/netport/cfg/encode', response_model=ApiEnvelope)
async def net_cfg_encode(request: NetCfgEncodeRequest) -> ApiEnvelope:
    try:
        return ApiEnvelope(data=await rfid_service.cfg_encode(request.pcMac, request.hwConfig, request.port0, request.port1, request.deviceMac))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get('/api/v1/rfid/logs', response_model=ApiEnvelope)
async def rfid_logs() -> ApiEnvelope:
    return ApiEnvelope(data=await rfid_service.get_logs())


@router.websocket('/ws/rfid/live')
async def rfid_live(websocket: WebSocket) -> None:
    await rfid_live_manager.connect(websocket)
    try:
        state = await rfid_service.get_state()
        await websocket.send_json({'type': 'connection', 'timestamp': None, 'payload': state.model_dump()})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        rfid_live_manager.disconnect(websocket)
    except Exception:
        rfid_live_manager.disconnect(websocket)
