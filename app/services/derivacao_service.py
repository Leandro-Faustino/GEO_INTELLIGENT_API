"""Profile derivation service for CO2."""

from app.core.config import get_settings
from app.ml.derivacao import derivar_criterios, resumo_estatistico
from app.schemas.contracts import CriterioDerivado, DerivarPerfilRequest, PerfilResponse


class DerivacaoService:
    """Derives an ideal profile from known good buyers."""

    def derivar(self, req: DerivarPerfilRequest) -> PerfilResponse:
        settings = get_settings()

        bons_com_recompra = [
            comprador
            for comprador in req.compradores
            if comprador.ativo and comprador.frequencia >= 2
        ]

        if len(bons_com_recompra) < 3:
            raise ValueError(
                "Mínimo de 3 compradores com recompra. "
                f"Encontrados: {len(bons_com_recompra)}."
            )

        compradores_ml = [
            {
                "atributos_originais": comprador.atributos_originais,
                "ticket_medio": comprador.ticket_medio,
            }
            for comprador in bons_com_recompra
        ]
        criterios_brutos = derivar_criterios(compradores_ml)
        criterios = [
            CriterioDerivado(
                nome=criterio["nome"],
                valor_min=criterio["valor_min"],
                valor_max=criterio["valor_max"],
                peso=criterio["peso"],
                tipo_comparacao=criterio["tipo_comparacao"],
            )
            for criterio in criterios_brutos
        ]

        return PerfilResponse(
            cliente_id=req.cliente_id,
            tipo=req.tipo_alvo,
            criterios=criterios,
            versao_modelo=settings.model_version,
        )

    def diagnostico(self, req: DerivarPerfilRequest) -> dict:
        compradores_ml = [
            {"ticket_medio": comprador.ticket_medio}
            for comprador in req.compradores
            if comprador.ativo and comprador.frequencia >= 2
        ]
        return resumo_estatistico(compradores_ml)
