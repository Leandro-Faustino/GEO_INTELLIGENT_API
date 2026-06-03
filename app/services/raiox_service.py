"""Raio-X service for customer ideal profile diagnostics."""

from collections import Counter
from statistics import mean

from app.schemas.contracts import (
    EstatisticasRaioX,
    FatorRaioX,
    PotencialRaioX,
    RaioXRequest,
    RaioXResponse,
    RetratoRaioX,
    SegmentoRaioX,
)


class RaioXService:
    """Builds a concise diagnostic report from known buyers."""

    def gerar(self, req: RaioXRequest) -> RaioXResponse:
        ativos = [comprador for comprador in req.compradores if comprador.ativo]
        if len(ativos) < 3:
            raise ValueError(
                "Mínimo de 3 compradores ativos para gerar o Raio-X. "
                f"Encontrados: {len(ativos)}."
            )

        compradores_fieis = [
            comprador for comprador in ativos if comprador.frequencia >= 2
        ]
        estatisticas = self._estatisticas(ativos, compradores_fieis, req)
        segmentos = self._segmentos(ativos)
        fatores = self._fatores(ativos)
        retrato = self._retrato(segmentos, estatisticas)
        potencial = self._potencial(segmentos, estatisticas)

        return RaioXResponse(
            retrato=retrato,
            fatores=fatores,
            estatisticas=estatisticas,
            segmentos=segmentos,
            potencial=potencial,
        )

    def _estatisticas(
        self,
        ativos,
        compradores_fieis,
        req: RaioXRequest,
    ) -> EstatisticasRaioX:
        tickets = [
            float(comprador.ticket_medio)
            for comprador in ativos
            if comprador.ticket_medio > 0
        ]
        percentual_fieis = (
            round(len(compradores_fieis) / len(ativos) * 100) if ativos else 0
        )

        return EstatisticasRaioX(
            total_clientes=len(req.compradores),
            ativos=len(ativos),
            com_recompra=len(compradores_fieis),
            percentual_fieis=percentual_fieis,
            ticket_medio=round(mean(tickets), 2) if tickets else None,
            ticket_min=min(tickets) if tickets else None,
            ticket_max=max(tickets) if tickets else None,
        )

    def _segmentos(self, ativos) -> list[SegmentoRaioX]:
        contador = Counter(self._segmento_do_comprador(comprador) for comprador in ativos)
        total = len(ativos)
        return [
            SegmentoRaioX(
                segmento=segmento,
                quantidade=quantidade,
                percentual=round(quantidade / total * 100),
            )
            for segmento, quantidade in contador.most_common(5)
        ]

    def _fatores(self, ativos) -> list[FatorRaioX]:
        total = len(ativos)
        fatores: list[FatorRaioX] = []

        for chave in ["cidade", "porte", "segmento", "cnae", "uf"]:
            valores = [
                self._normalizar_valor(comprador.atributos_originais.get(chave))
                for comprador in ativos
            ]
            valores = [valor for valor in valores if valor]
            if not valores:
                continue

            dominante, quantidade = Counter(valores).most_common(1)[0]
            percentual = round(quantidade / total * 100)
            fatores.append(
                FatorRaioX(
                    atributo=self._rotulo_atributo(chave),
                    peso_percentual=percentual,
                    descricao=(
                        f"{percentual}% dos clientes ativos compartilham "
                        f"{self._rotulo_atributo(chave).lower()} = {dominante}."
                    ),
                )
            )

        if not fatores:
            ticket_medio = round(
                mean(float(comprador.ticket_medio) for comprador in ativos), 2
            )
            fatores.append(
                FatorRaioX(
                    atributo="Ticket medio",
                    peso_percentual=100,
                    descricao=(
                        "A base ativa se concentra em torno de um ticket medio "
                        f"de {ticket_medio:.2f}."
                    ),
                )
            )

        fatores.sort(key=lambda fator: (-fator.peso_percentual, fator.atributo))
        return fatores[:4]

    def _retrato(
        self,
        segmentos: list[SegmentoRaioX],
        estatisticas: EstatisticasRaioX,
    ) -> RetratoRaioX:
        segmento_principal = segmentos[0].segmento if segmentos else "uma base diversificada"
        frase = f"O cliente ideal se concentra em {segmento_principal}."
        complemento = (
            f"{estatisticas.percentual_fieis}% da base ativa já apresenta recompra."
            if estatisticas.ativos > 0
            else None
        )
        return RetratoRaioX(frase=frase, complemento=complemento)

    def _potencial(
        self,
        segmentos: list[SegmentoRaioX],
        estatisticas: EstatisticasRaioX,
    ) -> PotencialRaioX:
        segmento_principal = segmentos[0].segmento if segmentos else "segmentos aderentes"
        mensagem = (
            f"A maior tração está em {segmento_principal}, com "
            f"{estatisticas.percentual_fieis}% de fidelização na base ativa."
        )
        cta = "Priorize prospecção em segmentos com o mesmo perfil dominante."
        return PotencialRaioX(mensagem=mensagem, cta=cta)

    def _segmento_do_comprador(self, comprador) -> str:
        atributos = comprador.atributos_originais
        for chave in ("segmento", "cnae", "porte", "cidade", "uf"):
            valor = self._normalizar_valor(atributos.get(chave))
            if valor:
                return f"{self._rotulo_atributo(chave)}: {valor}"
        return f"Tipo: {comprador.tipo}"

    def _rotulo_atributo(self, chave: str) -> str:
        rotulos = {
            "cidade": "Cidade",
            "porte": "Porte",
            "segmento": "Segmento",
            "cnae": "CNAE",
            "uf": "UF",
        }
        return rotulos.get(chave, chave.replace("_", " ").title())

    def _normalizar_valor(self, valor) -> str:
        if valor is None:
            return ""
        if isinstance(valor, (list, tuple, set)):
            return ", ".join(str(item).strip() for item in valor if str(item).strip())
        texto = str(valor).strip()
        return texto
