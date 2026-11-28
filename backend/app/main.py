from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import mindmap
from .config import settings

app = FastAPI(title="ITOGUCHI API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in settings.cors_origins.split(",") if o],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(mindmap.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
