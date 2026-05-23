"""FastAPI entry point for the GeoLead intelligence engine."""

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.api.routes import router
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("geolead.engine")

app = FastAPI(
    title="GeoLead Intelligence Engine",
    description="Motor de análise de dados e lookalike em Python.",
    version=settings.model_version,
)

http_requests = Counter(
    "engine_http_requests_total",
    "Total de requisições HTTP do motor Python.",
    ["method", "route", "status"],
)
http_duration = Histogram(
    "engine_http_request_duration_seconds",
    "Duração das requisições HTTP do motor Python.",
    ["method", "route"],
    buckets=[0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get(settings.request_id_header) or str(uuid.uuid4())

    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start

    route = request.scope.get("route")
    route_path = getattr(route, "path", request.url.path)

    if settings.metrics_enabled:
        labels = {"method": request.method, "route": route_path}
        http_duration.labels(**labels).observe(elapsed)
        http_requests.labels(**labels, status=str(response.status_code)).inc()

    logger.info(
        "request_completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "route": route_path,
            "status_code": response.status_code,
            "duration_seconds": round(elapsed, 6),
        },
    )

    response.headers[settings.request_id_header] = request_id
    return response


@app.get("/health", tags=["infra"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "geolead-engine"}


@app.get("/metrics", tags=["infra"])
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


app.include_router(router)
