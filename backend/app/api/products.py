from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.models.core_models import Product
from app.schemas.product import ProductCreate, ProductUpdate, Product as ProductSchema

router = APIRouter()

@router.get("/", response_model=List[ProductSchema])
async def read_products(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve products.
    """
    result = await db.execute(select(Product).offset(skip).limit(limit))
    products = result.scalars().all()
    return products

@router.post("/", response_model=ProductSchema)
async def create_product(
    *,
    db: AsyncSession = Depends(get_db),
    product_in: ProductCreate,
) -> Any:
    """
    Create new product.
    """
    product = Product(**product_in.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product

@router.get("/{id}", response_model=ProductSchema)
async def read_product(
    *,
    db: AsyncSession = Depends(get_db),
    id: int,
) -> Any:
    """
    Get product by ID.
    """
    result = await db.execute(select(Product).filter(Product.id == id))
    product = result.scalars().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
