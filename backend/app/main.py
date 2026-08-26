from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.baseline import router as baseline_router
from app.api.v1.optimize import router as optimize_router
from engine.errors import InfeasibleTarget, UnsupportedBuildingType, UnsupportedZip


def _problem(status: int, title: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        media_type="application/problem+json",
                        content={"type": "about:blank", "title": title,
                                 "status": status, "detail": detail})


def create_app() -> FastAPI:
    app = FastAPI(title="DBO Prototype API", version="0.1.0")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(UnsupportedZip)
    async def _zip_handler(_req, exc: UnsupportedZip):
        return _problem(422, "Unsupported ZIP code", str(exc))

    @app.exception_handler(UnsupportedBuildingType)
    async def _type_handler(_req, exc: UnsupportedBuildingType):
        return _problem(422, "Unsupported building type", str(exc))

    @app.exception_handler(InfeasibleTarget)
    async def _target_handler(_req, exc: InfeasibleTarget):
        return _problem(422, "Infeasible decarbonization target", str(exc))

    app.include_router(baseline_router, prefix="/api/v1")
    app.include_router(optimize_router, prefix="/api/v1")

    @app.get("/api/v1/health")
    def health() -> dict:
        return {"status": "ok"}

    return app
