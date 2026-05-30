# Motor de Inteligencia de Dados

Este documento descreve o estado atual do microsservico Python do GeoLead. O
motor nao e mais apenas um esqueleto executavel: as fases principais de
derivacao, analise lookalike, classificador e flywheel ja estao implementadas e
cobertas por testes.

## Ideia central

Lookalike e uma busca por similaridade: dado o perfil dos melhores clientes,
encontrar outras entidades parecidas. O gateway Node.js coleta, autentica,
valida e persiste. O motor Python processa estatistica, vetorizacao, kNN,
classificacao, raio-x e flywheel de re-treino.

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

## Estado atual implementado

- `app/core/config.py`: configuracao validada no boot com `pydantic-settings`.
- `app/schemas/contracts.py`: contratos Pydantic equivalentes aos DTOs usados
  pelo gateway. A entrada aceita `snake_case` e `camelCase`.
- `app/api/routes.py`: rotas `/derivar`, `/analisar`, `/raio-x` e `/feedback`
  com injecao de dependencia via `Depends()`.
- `app/services/derivacao_service.py`: valida a pre-condicao CO2 de pelo menos
  3 compradores ativos com recompra.
- `app/services/analise_service.py`: calcula oportunidades ranqueadas com score,
  prioridade e justificativa.
- `app/services/raiox_service.py`: gera retrato, fatores, estatisticas,
  segmentos e potencial em camelCase.
- `app/main.py`: `/health`, `/metrics`, `/docs`, correlation ID por
  `x-request-id` e metricas Prometheus.
- `app/ml/trainer.py`: persiste historico/modelo por cliente e aplica
  idempotencia por `feedback_id`.
- `app/ml/tasks.py`: suporta re-treino inline e via Celery.

## Regra para as proximas fases

Os services devem continuar orquestrando casos de uso. Implementacoes de ML
devem ficar em `app/ml/` como funcoes/classes puras e testaveis, sem depender
de FastAPI.
