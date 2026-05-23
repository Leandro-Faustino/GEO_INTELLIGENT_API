# Motor de Inteligencia de Dados

Este documento consolida o plano da pasta `files - fase 1 - python` para o
microsservico Python. A Fase 1 entrega apenas o esqueleto executavel; as fases
de ML entram depois em `app/ml/`.

## Ideia central

Lookalike e uma busca por similaridade: dado o perfil dos melhores clientes,
encontrar outras entidades parecidas. O gateway Node.js coleta, autentica,
valida e persiste. O motor Python processa estatistica, vetorizacao, kNN,
classificacao e geracao de ganchos quando essas fases forem implementadas.

## Fases

| Fase | Escopo | Modulos previstos |
| --- | --- | --- |
| 1 | FastAPI, Pydantic, endpoints, observabilidade e testes | `app/main.py`, `app/api`, `app/schemas`, `app/services` |
| 2 | Derivacao estatistica | `app/ml/derivacao.py` |
| 3 | Vetorizacao simples | `app/ml/vectorizer.py` |
| 4 | Busca kNN | `app/ml/knn.py` |
| 5 | Classificador de conversao | `app/ml/classifier.py` |
| 6 | Flywheel e re-treino via feedback | `app/ml/trainer.py` |
| 7 | Embeddings semanticos | `app/ml/embeddings.py` |
| 8 | Ganchos com LLM/RAG | `app/ml/hooks.py` |

## Fase 1 implementada

- `app/core/config.py`: configuracao validada no boot com `pydantic-settings`.
- `app/schemas/contracts.py`: contratos Pydantic equivalentes aos DTOs usados
  pelo gateway. A entrada aceita `snake_case` e `camelCase`.
- `app/api/routes.py`: rotas `/derivar`, `/analisar` e `/feedback` com
  injecao de dependencia via `Depends()`.
- `app/services/derivacao_service.py`: valida a pre-condicao CO2 de pelo menos
  3 compradores ativos com recompra.
- `app/services/analise_service.py`: remove `ja_clientes` e `exclusoes`, mas
  ainda nao calcula oportunidades.
- `app/main.py`: `/health`, `/metrics`, `/docs`, correlation ID por
  `x-request-id` e metricas Prometheus.

## Regra para as proximas fases

Os services devem continuar orquestrando casos de uso. Implementacoes de ML
devem ficar em `app/ml/` como funcoes/classes puras e testaveis, sem depender
de FastAPI.
