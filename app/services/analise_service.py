"""Lookalike analysis service for CO3."""

from app.core.config import get_settings
from app.ml.classifier import ClassificadorConversao
from app.ml.hooks import GeradorDeGancho, criar_gerador
from app.ml.knn import buscar_similares
from app.schemas.contracts import AnaliseResponse, AnalisarRequest, Oportunidade, Score


class AnaliseService:
    """Executes lookalike analysis over candidate target entities."""

    def __init__(
        self,
        classificador: ClassificadorConversao | None = None,
        gerador_gancho: GeradorDeGancho | None = None,
    ):
        self._classificador = classificador or ClassificadorConversao()
        self._gerador_gancho = gerador_gancho or criar_gerador()

    def analisar(self, req: AnalisarRequest) -> AnaliseResponse:
        settings = get_settings()

        removidos = set(req.ja_clientes) | set(req.exclusoes)
        candidatos = [
            {
                "identificador": entidade.identificador,
                "atributos": entidade.atributos,
                "nome": entidade.nome,
                "tipo": entidade.tipo,
            }
            for entidade in req.entidades
            if entidade.identificador not in removidos
        ]

        similares = buscar_similares(
            criterios=req.criterios,
            entidades=candidatos,
            limiar=req.limiar_similaridade,
            usar_embeddings=settings.embeddings_enabled,
        )
        candidatos_por_id = {candidato["identificador"]: candidato for candidato in candidatos}

        oportunidades: list[Oportunidade] = []
        for similar in similares:
            entidade = candidatos_por_id[similar["identificador"]]
            similaridade = float(similar["similaridade"])
            prob_conversao = self._classificador.prever_conversao(
                atributos=entidade["atributos"],
                similaridade_fallback=similaridade,
            )
            score_final = (
                round(0.4 * similaridade + 0.6 * prob_conversao, 4)
                if self._classificador.treinado
                else similaridade
            )
            prioridade = (
                "alta"
                if score_final >= 0.8
                else "media"
                if score_final >= 0.5
                else "baixa"
            )

            oportunidades.append(
                Oportunidade(
                    entidade_alvo_id=similar["identificador"],
                    tipo=str(entidade["tipo"]),
                    justificativa=(
                        f"{int(similaridade * 100)}% de similaridade com o perfil ideal."
                    ),
                    gancho_abordagem=self._gerador_gancho.gerar(
                        nome=str(entidade["nome"]),
                        atributos=entidade["atributos"],
                        similaridade=similaridade,
                    ),
                    prioridade=prioridade,
                    score=Score(
                        valor=score_final,
                        similaridade=similaridade,
                        prob_conversao=prob_conversao,
                    ),
                )
            )

        return AnaliseResponse(
            cliente_id=req.cliente_id,
            total_oportunidades=len(oportunidades),
            oportunidades=oportunidades,
            versao_modelo=settings.model_version,
        )
