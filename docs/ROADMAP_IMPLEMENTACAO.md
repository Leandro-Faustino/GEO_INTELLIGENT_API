# Roadmap de Implementacao

Este documento traduz o estado atual do GeoLead em uma sequencia de implementacao
aderente ao padrao do projeto:

- `plugins/` fazem bootstrap e DI
- `schemas/` definem contratos
- `routes/` ficam finas
- `services/` concentram regra de negocio
- `repositories/` encapsulam persistencia
- `adapters/` encapsulam integracoes externas e o motor Python

O objetivo nao e redesenhar a aplicacao. O objetivo e fechar as lacunas usando
as abstrações que ja existem.

## Objetivo Final

Ao final deste roadmap, o sistema deve atender estes criterios:

- `npm run build` verde
- `npm run test:unit` verde
- `npm run test:integration` verde
- `npm run test:security` verde
- `npm run test:engine` verde
- fluxo `cliente -> base interna -> perfil -> analise -> entrega -> feedback` funcional
- persistencia real consistente quando `DB_ENABLED=true`
- fallback em memoria preservado quando `DB_ENABLED=false`
- integracao Node/Python previsivel e testada

## Fase 0 - Regras de implementacao

Antes de alterar codigo, manter estas regras:

- nao mover regra de negocio para `routes`
- nao acoplar `services` ao Fastify
- nao deixar `repositories` conhecerem HTTP ou JWT
- manter `additionalProperties: false` nos schemas de entrada
- preservar selecao `memory` vs `pg/mongo/redis` via plugins
- toda feature nova entra com teste unitario e integracao

## Fase 1 - Fechar a base de persistencia

### Problema

A persistencia existe, mas ainda ha drift entre migrations, repositórios e o
que o README promete.

### Arquivos principais

- `src/migrations/001-initial-schema.sql`
- `src/migrations/002-row-level-security.sql`
- `src/migrations/003-client-owner.sql`
- `src/migrations/003-grant-app-role.sql`
- `scripts/migrate.ts`
- `src/repositories/pg/*.ts`

### Implementacao

1. Revisar todas as tabelas usadas pelos repositórios PostgreSQL:
   - `clientes`
   - `bases_internas`
   - `compradores_conhecidos`
   - `perfis_ideais`
   - `criterios_derivados`
   - `analises`
   - `oportunidades`
   - `entregas`
   - `feedbacks`
2. Garantir que cada campo usado pelos repositórios exista em migration.
3. Confirmar que `owner_id` e demais colunas obrigatorias estejam cobertas por
   migrations idempotentes.
4. Revisar chaves, indices e `CHECK constraints` para os caminhos reais das rotas.
5. Criar um teste de integracao especifico de persistencia real por dominio.

### Critério de aceite

- migrations aplicam em banco limpo sem ajuste manual
- todos os repositórios PostgreSQL conseguem ler/escrever no schema versionado

## Fase 2 - Operacionalizar tenancy e RLS

### Problema

O SQL define RLS, mas o contexto de tenant ainda nao e aplicado de forma
consistente pela aplicacao.

### Arquivos principais

- `src/migrations/002-row-level-security.sql`
- `src/plugins/42-datasource.ts`
- `src/plugins/45-services.ts`
- `src/routes/clientes/clientes.routes.ts`
- `src/routes/perfis/perfis.routes.ts`
- `src/routes/analises/analises.routes.ts`
- `src/routes/entregas/entregas.routes.ts`

### Implementacao

1. Definir o tenant transacional como `clienteId`.
2. Criar um mecanismo unico para executar queries PostgreSQL com
   `SET LOCAL app.current_cliente_id`.
3. Nao espalhar `SET LOCAL` em cada handler; encapsular isso em helper de
   repositorio ou unidade de trabalho.
4. Revisar rotas que recebem `clienteId` e validar ownership do recurso.
5. Adicionar testes de acesso cruzado entre dois usuarios/clientes.

### Decisao recomendada

Criar um wrapper de execucao transacional para repositórios PostgreSQL, em vez
de embutir o tenant em SQL de rota ou service.

### Critério de aceite

- um usuario nao consegue ler nem alterar dados de outro tenant
- o isolamento e garantido no banco e nao so na aplicacao

## Fase 3 - Implementar de fato o bounded context de entregas

### Status

Implementado. EntregaService completo, feedback persiste localmente e aciona o motor, isolamento entre tenants coberto por teste de integração.

### Problema original

As rotas de entrega existiam, mas ainda respondiam com stubs.

### Arquivos principais

- `src/routes/entregas/entregas.routes.ts`
- `src/services/entrega.service.ts`
- `src/repositories/interfaces/index.ts`
- `src/repositories/pg/entrega.pg-repo.ts`
- `src/repositories/memory/index.ts`
- `src/schemas/entregas/index.ts`

### Implementacao

1. Expandir `EntregaDTO` para representar a entrega real.
2. Introduzir um DTO de feedback de entrega.
3. Criar interface de repositorio para feedbacks.
4. Expandir `EntregaService` para:
   - montar entrega a partir de analise persistida
   - buscar entrega por ID
   - registrar feedback
5. Ligar feedback ao motor Python por orquestracao, sem perder o registro local.
6. Atualizar `src/plugins/45-services.ts` para injetar o service completo.

### Decisao recomendada

A entrega deve nascer de uma `analise` salva. Nao montar entrega a partir de
payload solto. A analise e a fonte de verdade das oportunidades.

### Novos contratos sugeridos

- incluir `analiseId` em `MontarEntregaBody`
- resposta de entrega pode incluir `totalOportunidades`, `tipo`, `periodo`,
  `formato` e referencia da analise de origem
- feedback deve aceitar:
  - `exclusoes`
  - `ajustes`
  - `resultados`
  - `observacoes`

### Critério de aceite

- `POST /entregas` cria entrega real
- `GET /entregas/:id` devolve entrega persistida
- `POST /entregas/:id/feedback` persiste feedback e aciona flywheel quando houver resultados

## Fase 4 - Persistir os dominios ainda presos em memoria

### Problema

Nem todos os dominios centrais usam persistencia real com `DB_ENABLED=true`.

### Arquivos principais

- `src/plugins/45-services.ts`
- `src/repositories/interfaces/index.ts`
- `src/repositories/memory/index.ts`
- `src/repositories/pg/`
- `src/services/alerta.service.ts`

### Implementacao

1. Criar `AlertaPgRepository`.
2. Criar repositorio de `feedbacks` para PostgreSQL.
3. Manter repositorios em memoria equivalentes para modo local/teste leve.
4. Atualizar DI para selecionar `pg` ou `memory` por config, como o sistema ja faz.

### Critério de aceite

- `alertas`, `entregas` e `feedbacks` funcionam com persistencia real
- o fallback em memoria continua intacto

## Fase 5 - Corrigir a suite de seguranca sem enfraquecer producao

### Problema

A suite OWASP falha com `503`, indicando interferencia de resiliência em teste.

### Arquivos principais

- `src/plugins/20-support.ts`
- `test/owasp.security.test.ts`
- `src/test-helper.ts`

### Implementacao

1. Parametrizar `under-pressure` para ambiente de teste.
2. Preservar o comportamento de protecao em `production`.
3. Garantir que os testes OWASP validem semantica de seguranca, nao indisponibilidade operacional.
4. Se necessario, criar um flag de config para desabilitar `under-pressure` em teste.

### Critério de aceite

- `npm run test:security` passa sem remover as protecoes de autenticação, RBAC,
  SSRF, NoSQL guard e headers

## Fase 6 - Consolidar o fluxo Node -> Python -> feedback

### Problema

A integracao existe, mas o ciclo completo ainda nao esta fechado no gateway.

### Arquivos principais

- `src/adapters/motor.client.ts`
- `src/plugins/49-motor.ts`
- `src/routes/analises/analises.routes.ts`
- `src/routes/raio-x/raio-x.routes.ts`
- `app/api/routes.py`
- `app/ml/tasks.py`
- `app/ml/trainer.py`

### Implementacao

1. Definir idempotencia no envio de feedback ao motor.
2. Garantir persistencia local antes do envio ao motor.
3. Tratar erros do motor sem perder o feedback do gateway.
4. Padronizar a traduçao `camelCase` <-> `snake_case`.
5. Criar teste integrado do ciclo:
   - derivar perfil
   - executar analise
   - montar entrega
   - registrar feedback
   - confirmar resposta do flywheel

### Status atual

- concluido no gateway para `analisar`, `feedback` e `raio-x`
- `motor.client.ts` agora concentra serializacao e normalizacao dos contratos
- feedback ao motor possui idempotencia por `feedbackId`
- testes Node + Python cobrem o contrato consolidado

### Proximo foco

- reduzir mocks dos adapters externos
- alinhar README e docs complementares ao estado real da integracao

### Critério de aceite

- feedbacks ficam persistidos mesmo com motor indisponivel
- retreino inline ou celery acontece conforme configuracao

## Fase 7 - Reduzir dependencia de mocks dos adapters externos

### Problema

Os adapters mantem o sistema funcional, mas parte relevante do comportamento
externo ainda e mockada.

### Arquivos principais

- `src/plugins/48-adapters.ts`
- `src/adapters/cnpj.adapter.ts`
- `src/adapters/ibge.adapter.ts`
- `src/adapters/geocoder.adapter.ts`
- `src/adapters/registro-imoveis.adapter.ts`
- `src/services/coleta.service.ts`
- `src/adapters/cached-fonte.adapter.ts`
- `src/plugins/47-cache.ts`

### Implementacao

1. Formalizar em cada adapter:
   - modo real
   - modo fixture/mock
2. Priorizar adapter de `CNPJ`, que ja aceita API real.
3. Adicionar cache Redis em consultas caras e repetitivas.
4. Revisar timeouts, retries e circuit breaker por fonte.
5. Expor no endpoint de fontes se o adapter esta em modo real ou mock.

### Status atual

- `GET /fontes` expoe `modo` por adapter: `real`, `mock` ou `hibrido`
- `CNPJ` opera como `hibrido` quando `CNPJ_API_URL` esta configurado e como
  `mock` quando nao ha credencial externa
- `IBGE` opera como `hibrido` quando `IBGE_BASE_URL` esta configurado e como
  `mock` quando nao ha base externa
- `IBGE` real usa Localidades para resolver municipios e Agregados para
  populacao, PIB municipal em mil reais e PIB per capita estimado
- `IBGE` real adiciona `idh` e `idhAno` quando
  `IDH_MUNICIPAL_DATASET_PATH` aponta para dataset JSON validado
- `npm run validate:idh -- <arquivo.json>` valida o dataset de IDH municipal
  antes do deploy
- `Geocoder` opera como `hibrido` quando `NOMINATIM_BASE_URL` e
  `NOMINATIM_USER_AGENT` estao configurados; sem User-Agent identificavel,
  permanece em `mock`
- `Geocoder` real usa Nominatim `/search` com `format=jsonv2`,
  `addressdetails=1`, `limit=1`, `countrycodes=br`, throttle global e
  normalizacao para latitude, longitude, bairro, municipio, UF e confianca
- `setorCensitario` e preenchido pelo Geocoder quando
  `SETORES_CENSITARIOS_GEOJSON_PATH` aponta para uma malha GeoJSON local do
  IBGE; sem arquivo configurado, permanece `null`
- `npm run validate:setores -- <arquivo.geojson>` valida a malha antes do
  deploy e o boot registra `warn` quando o caminho configurado e invalido
- consultas e enriquecimentos passam por cache-aside via `CachedFonteAdapter`
- Redis e usado quando `REDIS_URL` esta configurado; caso contrario, o cache em
  memoria mantem o mesmo contrato em desenvolvimento e testes

### Proximo foco

- escolher e validar provedor oficial/pago ou instancia propria para alto volume
  de Geocoder
- exercitar `CNPJ_API_URL` contra uma API real no ambiente de homologacao
- exercitar `IBGE_BASE_URL` contra a API publica do IBGE no ambiente de homologacao
- exercitar `NOMINATIM_BASE_URL` contra Nominatim publico apenas em baixo volume
- preparar pipeline operacional para baixar/recortar/converter malhas IBGE por
  municipio ou UF antes de carregar no gateway
- documentar contrato esperado de resposta para cada provedor real

### Critério de aceite

- o operador sabe quais fontes sao reais e quais sao mock
- o sistema continua utilizavel sem credenciais externas

## Fase 8 - Alinhar documentacao e readiness operacional

### Problema

A documentacao ja nao reflete completamente o codigo atual.

### Arquivos principais

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/MOTOR_INTELIGENCIA_PYTHON.md`
- `docs/PRATICAS_PERSISTENCIA.md`

### Implementacao

1. Atualizar o fluxo funcional real no README.
2. Remover afirmacoes antigas sobre motor "apenas esqueleto".
3. Documentar claramente:
   - o que e fallback local
   - o que depende de banco
   - o que depende do motor
   - o que ainda pode operar com mock
4. Criar uma matriz simples de readiness:
   - desenvolvimento
   - homologacao
   - producao

### Critério de aceite

- documentacao acompanha o comportamento real do sistema

## Ordem de execucao recomendada

1. Fase 1 - persistencia base
2. Fase 2 - tenancy e RLS
3. Fase 3 - entregas
4. Fase 4 - persistencia faltante
5. Fase 5 - seguranca
6. Fase 6 - ciclo completo com motor
7. Fase 7 - adapters externos
8. Fase 8 - documentacao final

## Primeiro lote de implementacao

O primeiro lote deve ser pequeno e destravar o resto:

1. ajustar schema/migrations e testes de persistencia
2. parametrizar `under-pressure` para teste
3. expandir contratos de entrega e feedback
4. implementar `EntregaService` completo
5. adicionar repositório de feedbacks

Esse lote fecha a base estrutural sem entrar ainda em integracoes externas
mais caras.

## Arquivos que provavelmente serao criados

- `src/repositories/interfaces/feedback.repository.ts`
- `src/repositories/pg/feedback.pg-repo.ts`
- `src/repositories/pg/alerta.pg-repo.ts`
- `test/unit/entrega.service.test.ts`
- `test/integration/entregas.routes.test.ts` (expansao)
- `test/integration/security-under-pressure.test.ts` ou equivalente

## Arquivos que provavelmente serao alterados

- `src/plugins/20-support.ts`
- `src/plugins/45-services.ts`
- `src/repositories/interfaces/index.ts`
- `src/repositories/memory/index.ts`
- `src/routes/entregas/entregas.routes.ts`
- `src/services/entrega.service.ts`
- `src/schemas/entregas/index.ts`
- `src/migrations/*.sql`

## Definicao de pronto por fase

Cada fase so termina quando:

- o codigo compila
- testes da fase passam
- nao ha regressao nas rotas existentes
- o comportamento esta refletido na documentacao minima necessaria
