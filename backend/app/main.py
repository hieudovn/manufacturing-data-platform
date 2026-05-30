from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_keys import router as api_keys_router
from app.api.auth import router as auth_router
from app.api.connections import router as connections_router
from app.api.data_models import router as data_models_router
from app.api.health import router as health_router
from app.api.inbound import router as inbound_router
from app.api.outbound import router as outbound_router
from app.api.transactions import router as transactions_router
from app.api.users import router as users_router
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.user_service import seed_default_admin


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    with SessionLocal() as db:
        seed_default_admin(db)
    yield


app = FastAPI(
    title="Manufacturing Data Platform API",
    version="0.1.0",
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(data_models_router)
app.include_router(api_keys_router)
app.include_router(connections_router)
app.include_router(inbound_router)
app.include_router(outbound_router)
app.include_router(transactions_router)
