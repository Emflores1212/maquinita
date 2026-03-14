from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.rfid import SessionState
from app.services.rfid_service import rfid_service


client = TestClient(app)


def test_get_capabilities_endpoint(monkeypatch) -> None:
    async def fake_capabilities():
        return {
            'serial_supported': True,
            'serial_ports_detected': [],
            'transports': ['tcp', 'serial'],
            'actions': {'inventory': True},
        }

    monkeypatch.setattr(rfid_service, 'get_capabilities', fake_capabilities)
    response = client.get('/api/v1/rfid/capabilities')

    assert response.status_code == 200
    assert response.json()['data']['serial_supported'] is True


def test_session_state_endpoint(monkeypatch) -> None:
    async def fake_state():
        return SessionState(
            connected=True,
            inventory_running=False,
            active_transport='tcp',
            read_id='FF',
            connection=None,
            last_error=None,
            operation_in_progress=False,
            snapshot_count=0,
        )

    monkeypatch.setattr(rfid_service, 'get_state', fake_state)
    response = client.get('/api/v1/rfid/session/state')

    assert response.status_code == 200
    assert response.json()['data']['connected'] is True
    assert response.json()['data']['active_transport'] == 'tcp'
