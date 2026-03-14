from __future__ import annotations

import json
from typing import Set

from fastapi import WebSocket


class RfidConnectionManager:
    def __init__(self) -> None:
        self.connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        stale: list[WebSocket] = []
        for connection in list(self.connections):
            try:
                await connection.send_text(json.dumps(message, default=str))
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)


rfid_live_manager = RfidConnectionManager()
