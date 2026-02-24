from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

# Shared properties
class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    is_active: bool = True

# Properties to receive on item creation
class ProductCreate(ProductBase):
    pass

# Properties to receive on item update
class ProductUpdate(ProductBase):
    name: Optional[str] = None
    price: Optional[float] = None

# Properties shared by models stored in DB
class ProductInDBBase(ProductBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Properties to return to client
class Product(ProductInDBBase):
    pass
