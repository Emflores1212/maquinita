from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.ws_manager import manager

router = APIRouter()

@router.websocket("/ws/kiosk/{machine_id}")
async def websocket_endpoint(websocket: WebSocket, machine_id: int):
    await manager.connect(websocket, machine_id)
    try:
        while True:
            # El Kiosk o Pi rara vez envía mensajes por aquí, es un canal más para Recibir del Backend
            # pero podemos escuchar pings.
            data = await websocket.receive_text()
            # print(f"Recibido mensaje en WS de {machine_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(machine_id)
