"""Pluggable approach hook generation for phase 8."""

from __future__ import annotations

from typing import Callable, Protocol


class GeradorDeGancho(Protocol):
    def gerar(
        self,
        nome: str,
        atributos: dict,
        similaridade: float,
        gatilhos: list[str] | None = None,
    ) -> str: ...


class GeradorTemplate:
    """Deterministic grounded hook generator."""

    def gerar(
        self,
        nome: str,
        atributos: dict,
        similaridade: float,
        gatilhos: list[str] | None = None,
    ) -> str:
        partes = [
            f"{nome} tem {int(similaridade * 100)}% de compatibilidade com seus melhores clientes"
        ]

        if atributos:
            chave, _valor = next(iter(atributos.items()))
            partes.append(f"(perfil semelhante em {chave})")

        if gatilhos:
            partes.append(f"- momento oportuno: {gatilhos[0]}")

        return " ".join(partes) + "."


class GeradorLLM:
    """Optional grounded LLM hook generator with template fallback."""

    def __init__(self, chamar_llm: Callable[[str], str]):
        self._chamar_llm = chamar_llm

    def gerar(
        self,
        nome: str,
        atributos: dict,
        similaridade: float,
        gatilhos: list[str] | None = None,
    ) -> str:
        prompt = (
            "Você é um especialista em prospecção B2B. Com base apenas nas "
            "informações abaixo, escreva um gancho de abordagem comercial "
            "conciso, específico e fundamentado.\n\n"
            f"Informações:\n{self._montar_contexto(nome, atributos, similaridade, gatilhos)}\n\n"
            "Gancho de abordagem:"
        )

        try:
            return self._chamar_llm(prompt).strip()
        except Exception:
            return GeradorTemplate().gerar(nome, atributos, similaridade, gatilhos)

    @staticmethod
    def _montar_contexto(
        nome: str,
        atributos: dict,
        similaridade: float,
        gatilhos: list[str] | None,
    ) -> str:
        linhas = [
            f"- Nome: {nome}",
            f"- Similaridade com perfil ideal: {int(similaridade * 100)}%",
        ]
        for chave, valor in atributos.items():
            linhas.append(f"- {chave}: {valor}")
        if gatilhos:
            linhas.append(f"- Gatilhos de compra: {', '.join(gatilhos)}")
        return "\n".join(linhas)


def criar_gerador(
    llm_habilitado: bool = False,
    chamar_llm: Callable[[str], str] | None = None,
) -> GeradorDeGancho:
    if llm_habilitado and chamar_llm is not None:
        return GeradorLLM(chamar_llm)
    return GeradorTemplate()
