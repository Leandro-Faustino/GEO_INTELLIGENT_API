"""Pydantic contracts used between the Node gateway and the Python engine."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="ignore",
        populate_by_name=True,
    )


class CompradorConhecido(ContractModel):
    identificador: str
    nome: str
    tipo: str = Field(pattern="^(pj|pf|territorio)$")
    atributos_originais: dict[str, Any] = Field(default_factory=dict)
    ticket_medio: float = Field(default=0, ge=0)
    frequencia: int = Field(default=0, ge=0)
    ativo: bool = True


class EntidadeAlvo(ContractModel):
    identificador: str
    nome: str
    tipo: str
    atributos: dict[str, Any] = Field(default_factory=dict)
    endereco: str = ""
    latitude: float = 0
    longitude: float = 0
    fonte: str = ""
    escopo: str = ""


class DerivarPerfilRequest(ContractModel):
    cliente_id: str
    tipo_alvo: str = Field(default="pj", pattern="^(pj|pf|territorio)$")
    compradores: list[CompradorConhecido] = Field(min_length=1)


class AnalisarRequest(ContractModel):
    cliente_id: str
    criterios: list[dict[str, Any]] = Field(default_factory=list)
    entidades: list[EntidadeAlvo] = Field(min_length=1)
    exclusoes: list[str] = Field(default_factory=list)
    ja_clientes: list[str] = Field(default_factory=list)
    limiar_similaridade: float = Field(default=0.3, ge=0, le=1)


class ResultadoConversao(ContractModel):
    entidade_alvo_id: str
    converteu: bool
    atributos: dict[str, Any] = Field(default_factory=dict)
    ticket_real: float | None = Field(default=None, ge=0)


class FeedbackRequest(ContractModel):
    cliente_id: str
    resultados: list[ResultadoConversao]


class CriterioDerivado(ContractModel):
    nome: str
    valor_min: Any
    valor_max: Any
    peso: float = Field(ge=0, le=1)
    tipo_comparacao: str


class PerfilResponse(ContractModel):
    cliente_id: str
    tipo: str
    criterios: list[CriterioDerivado]
    versao_modelo: str


class Score(ContractModel):
    valor: float = Field(ge=0, le=1)
    similaridade: float = Field(ge=0, le=1)
    prob_conversao: float = Field(ge=0, le=1)


class Oportunidade(ContractModel):
    entidade_alvo_id: str
    tipo: str
    justificativa: str
    gancho_abordagem: str
    prioridade: str = Field(pattern="^(alta|media|baixa)$")
    score: Score


class AnaliseResponse(ContractModel):
    cliente_id: str
    total_oportunidades: int
    oportunidades: list[Oportunidade]
    versao_modelo: str
