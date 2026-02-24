from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import products, machines, ws, vision

app = FastAPI(
    title=settings.APP_NAME,
    description="Backend API for Maquinita Smart Vending",
    version="1.0.0",
)

# Configurar CORS (Permitir requests desde la UI de la Pi y el Dashboard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Cambiar a dominios específicos en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router, prefix=f"{settings.API_V1_STR}/products", tags=["products"])
app.include_router(machines.router, prefix=f"{settings.API_V1_STR}/machines", tags=["machines"])
app.include_router(ws.router, tags=["websockets"])
app.include_router(vision.router, prefix=f"{settings.API_V1_STR}/vision", tags=["vision-ai"])

@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
