from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class MachineBase(BaseModel):
    name: str
    location: Optional[str] = None
    is_online: bool = False
    door_locked: bool = True

class MachineCreate(MachineBase):
    pass

class MachineUpdate(MachineBase):
    name: Optional[str] = None
    is_online: Optional[bool] = None
    door_locked: Optional[bool] = None

class MachineInDBBase(MachineBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Machine(MachineInDBBase):
    pass

class UnlockRequest(BaseModel):
    payment_method_id: str  # Simula el "tap" de la tarjeta
