# ML Roadmap

Este diretório fica reservado para as fases de inteligência do motor Python.

- Fase 2: derivação estatística dos critérios do perfil ideal (`derivacao.py`).
- Fase 3: vetorização e busca kNN por similaridade (`vectorizer.py`, `knn.py`).
- Fase 5: classificador de probabilidade de conversão (`classifier.py`).
- Fase 6: re-treino a partir do feedback (`trainer.py`).
- Fase 8: geração de justificativas e ganchos (`hooks.py`).

Na Fase 2, `derivacao.py` implementa a extração estatística real do perfil:
atributos numéricos viram ranges robustos, atributos categóricos viram enums
frequentes, e pesos são calculados por consistência.

Fases 7 e 8 ficam desligadas por padrão. Embeddings semânticos usam API externa
ou SBERT local apenas quando `EMBEDDINGS_ENABLED=true`; se o provedor não estiver
disponível, a busca volta para o kNN numérico. Ganchos usam template por padrão e
podem receber um gerador LLM injetado.
