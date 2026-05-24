"""Domain routes for the intelligence engine."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.schemas.contracts import (
    AnaliseResponse,
    AnalisarRequest,
    DerivarPerfilRequest,
    FeedbackRequest,
    PerfilResponse,
)
from app.core.config import get_settings
from app.ml.tasks import enfileirar_retreino
from app.ml.trainer import Trainer
from app.services.analise_service import AnaliseService
from app.services.derivacao_service import DerivacaoService

router = APIRouter()


async def get_derivacao_service() -> DerivacaoService:
    return DerivacaoService()


async def get_trainer() -> Trainer:
    return Trainer(models_dir=get_settings().models_dir)


@router.post(
    "/derivar",
    response_model=PerfilResponse,
    tags=["perfil"],
)
async def derivar_perfil(
    req: DerivarPerfilRequest,
    service: DerivacaoService = Depends(get_derivacao_service),
) -> PerfilResponse:
    try:
        return service.derivar(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/analisar",
    response_model=AnaliseResponse,
    tags=["analise"],
)
async def analisar(
    req: AnalisarRequest,
    trainer: Trainer = Depends(get_trainer),
) -> AnaliseResponse:
    classificador = trainer.carregar_classificador(req.cliente_id)
    service = AnaliseService(classificador=classificador)
    return service.analisar(req)


@router.post("/feedback", tags=["feedback"])
async def registrar_feedback(
    req: FeedbackRequest,
) -> JSONResponse:
    resultados = [
        {
            "entidade_alvo_id": resultado.entidade_alvo_id,
            "converteu": resultado.converteu,
            "atributos": resultado.atributos,
            "ticket_real": resultado.ticket_real,
        }
        for resultado in req.resultados
    ]
    enfileiramento = enfileirar_retreino(req.cliente_id, resultados)
    convertidos = sum(1 for resultado in req.resultados if resultado.converteu)

    body = {
        "recebido": True,
        "total": len(req.resultados),
        "convertidos": convertidos,
        **enfileiramento,
    }
    status_code = 202 if enfileiramento.get("enfileirado") else 200
    return JSONResponse(status_code=status_code, content=body)
