from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.models.core_models import Machine
from app.schemas.machine import MachineCreate, MachineUpdate, Machine as MachineSchema, UnlockRequest
from app.core.ws_manager import manager  # <--- Importamos el manager WS

router = APIRouter()

@router.get("/", response_model=List[MachineSchema])
async def read_machines(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    result = await db.execute(select(Machine).offset(skip).limit(limit))
    return result.scalars().all()

@router.post("/", response_model=MachineSchema)
async def create_machine(
    *,
    db: AsyncSession = Depends(get_db),
    machine_in: MachineCreate,
) -> Any:
    machine = Machine(**machine_in.model_dump())
    db.add(machine)
    await db.commit()
    await db.refresh(machine)
    return machine

@router.post("/{id}/unlock", response_model=dict)
async def request_unlock(
    *,
    db: AsyncSession = Depends(get_db),
    id: int,
    unlock_req: UnlockRequest
) -> Any:
    """
    Simula el proceso de pre-autorización de pago y envío de señal para abrir la puerta.
    """
    result = await db.execute(select(Machine).filter(Machine.id == id))
    machine = result.scalars().first()
    
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
        
    if not machine.is_online:
        raise HTTPException(status_code=400, detail="Machine is offline and cannot be unlocked")
        
    # Aquí iría la lógica real de Stripe Pre-Auth usando unlock_req.payment_method_id
    payment_authorized = True # Mock
    
    if payment_authorized:
        # Enviar señal al Raspberry Pi (via WebSocket / MQTT en el futuro)
        # Actualizamos el estado en DB
        machine.door_locked = False
        db.add(machine)
        await db.commit()
        
        # ---> Notificamos a la Kiosk UI de esta máquina que la puerta fue abierta
        await manager.send_personal_message(
            {"event": "door_status", "status": "unlocked"}, 
            machine_id=id
        )

        return {"status": "success", "message": "Payment pre-authorized. Door unlocked."}
    else:
        raise HTTPException(status_code=402, detail="Payment declined")
        raise HTTPException(status_code=402, detail="Payment declined")
