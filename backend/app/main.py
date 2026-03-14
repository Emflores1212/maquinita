from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.api import products, machines, ws, vision, rfid

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
app.include_router(rfid.router, tags=["rfid"])

DIST_DIR = Path(__file__).resolve().parents[2] / "maquinita-ui" / "dist"
ASSETS_DIR = DIST_DIR / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="maquinita-ui-assets")


@app.get("/")
def read_root():
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": f"Welcome to {settings.APP_NAME} API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("ws/"):
        raise HTTPException(status_code=404, detail="Not found")
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend build not found")
