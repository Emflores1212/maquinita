from __future__ import annotations

from pathlib import Path

import pytest

from rfid_desktop.app import DesktopStateStore
from rfid_runtime.controller import RfidController
from rfid_tools import RfidError


def test_inventory_requires_connection() -> None:
    controller = RfidController()
    with pytest.raises(RfidError):
        controller.start_inventory({'rounds': 1, 'continuous': False, 'intervalMs': 100, 'readPhase': False})


def test_desktop_state_store_roundtrip(tmp_path: Path) -> None:
    store = DesktopStateStore(tmp_path / 'state.json')
    payload = {
        'connection': {'transport': 'tcp', 'host': '192.168.1.116', 'port': 4001},
        'inventory': {'rounds': 2, 'continuous': True},
    }

    store.save(payload)
    loaded = store.load()

    assert loaded['connection']['host'] == '192.168.1.116'
    assert loaded['inventory']['rounds'] == 2
