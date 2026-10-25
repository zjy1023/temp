from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.api.admin_annotators import router as admin_annotators_router
from app.api.admin_stats import router as admin_stats_router
from app.api.admin_tasks import router as admin_tasks_router
from app.api.admin_tenants import router as admin_tenants_router
from app.api.admin_videos import router as admin_videos_router
from app.api.annotator_assignments import router as annotator_assignments_router
from app.api.annotator_tasks import router as annotator_tasks_router
from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.videos import router as videos_router
from app.core.config import settings
from app.domain.errors import DomainError

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="多租户视频片段标注平台",
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="session",
    max_age=7 * 24 * 60 * 60,
    same_site="lax",
    https_only=settings.session_cookie_secure,
)

if settings.app_env == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin not in settings.origins:
            return JSONResponse(
                status_code=403,
                content={"code": "FORBIDDEN", "message": "非法来源", "details": {}},
            )
    return await call_next(request)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.code,
            "message": exc.message,
            "details": jsonable_encoder(exc.details),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "code": "VALIDATION_ERROR",
            "message": "请求参数不合法",
            "details": {"errors": jsonable_encoder(exc.errors())},
        },
    )


app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_tenants_router, prefix="/api")
app.include_router(admin_videos_router, prefix="/api")
app.include_router(admin_tasks_router, prefix="/api")
app.include_router(admin_annotators_router, prefix="/api")
app.include_router(admin_stats_router, prefix="/api")
app.include_router(annotator_tasks_router, prefix="/api")
app.include_router(annotator_assignments_router, prefix="/api")
app.include_router(videos_router, prefix="/api")


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "health": "/api/health",
        "docs": "/docs",
    }
