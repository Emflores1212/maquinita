from typing import Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.database import get_db

router = APIRouter()

class SensorFusionRequest(BaseModel):
    machine_id: int
    rfid_missing_items: List[int]
    camera_detected_items: List[str]

@router.post("/verify-taking", response_model=dict)
async def verify_sensor_fusion(
    *,
    db: AsyncSession = Depends(get_db),
    fusion_data: SensorFusionRequest
) -> Any:
    """
    Recibe la diferencia de Inventario RFID y las detecciones de YOLO (Camera).
    Compara ambos arrays. Si existe una discrepancia fuerte (ej: RFID detecta 1 producto faltante
    pero la cámara vio salir 2 o viceversa), levanta un Flag de Fraude en la Base de Datos
    para revisión del operador.
    """
    
    # Lógica simplificada de Fusión de Sensores
    rfid_count = len(fusion_data.rfid_missing_items)
    camera_count = len(fusion_data.camera_detected_items)
    
    discrepancy = abs(rfid_count - camera_count)
    
    if discrepancy > 0:
        # TODO: Enviar alerta a tabla `FraudAlerts` para el Dashboard
        return {
            "status": "warning",
            "message": "Discrepancia detectada entre sensores (RFID vs Cámara)",
            "rfid_count": rfid_count,
            "camera_count": camera_count,
            "action_required": "Review Video Log"
        }
        
    return {
        "status": "success",
        "message": "Fusión de Sensores exitosa. Cobro autorizado exacto.",
        "items_taken": rfid_count
    }
