from typing import Dict, List, Any
import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Mapea un machine_id (identificador de la máquina física) con su WebSocket activo
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, machine_id: int):
        await websocket.accept()
        self.active_connections[machine_id] = websocket

    def disconnect(self, machine_id: int):
        if machine_id in self.active_connections:
            del self.active_connections[machine_id]

    async def send_personal_message(self, message: dict, machine_id: int):
        if machine_id in self.active_connections:
            await self.active_connections[machine_id].send_text(json.dumps(message))

    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass

manager = ConnectionManager()
