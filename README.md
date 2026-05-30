# GeoLead — Documentação Completa do Sistema

> Documento mestre: o que é, o que resolve, arquitetura, fluxo, configuração,
> jornada do usuário e cada rota da API detalhada — do login ao flywheel.

---

# SUMÁRIO

1. O que é o GeoLead
2. O problema que resolve
3. Arquitetura do sistema
4. Diagrama de sequência
5. Como configurar a aplicação
6. Sequência operacional do usuário
7. As rotas da API — detalhadas, do login ao fim
8. Estado atual e próximos passos

---

# 1. O QUE É O GEOLEAD

O GeoLead é um **motor de inteligência de mercado** que encontra novos clientes
por semelhança (*lookalike*). A premissa é simples: seus melhores clientes têm um
padrão; quem se parece com eles tende a ser um bom cliente também.

O sistema recebe a base de quem **já compra** de uma empresa, deriva o "perfil
ideal" desses compradores, busca em fontes externas **quem se parece** com esse
perfil, e — o diferencial — **aprende com o resultado**: cada venda fechada (ou
perdida) re-treina o modelo, que fica mais preciso a cada ciclo.

É **genérico por design**: o piloto é um franqueado de colchões buscando hotéis e
ILPIs, mas o mesmo motor serve qualquer segmento B2B. *"O vertical muda; o motor
não."* Troca-se a base interna e as fontes — o pipeline de inteligência é o mesmo.

---

# 2. O PROBLEMA QUE RESOLVE

**Prospecção B2B é cara e imprecisa.** Equipes comerciais gastam tempo abordando
empresas que nunca iam comprar, enquanto deixam passar as que tinham alto
potencial. O problema tem três camadas que o GeoLead ataca:

**1. Quem procurar?** Sem método, a prospecção é por intuição. O GeoLead
quantifica o perfil dos bons clientes (estatística sobre a base interna) e busca
parecidos em fontes públicas — objetivo, não palpite.

**2. Parecido é o suficiente?** Não. Duas empresas idênticas no papel podem ter
destinos opostos — uma converte, a outra não, por fatores que não estão nos
atributos óbvios. O GeoLead separa **similaridade** (quem se parece) de
**probabilidade de conversão** (quem realmente compra), aprendida dos resultados
reais.

**3. Como melhorar com o tempo?** A maioria das ferramentas é estática. O GeoLead
tem um **flywheel**: cada feedback de venda re-treina o modelo. Quanto mais se
usa, mais preciso fica. O conhecimento acumula.

**Resultado para o usuário:** uma lista de oportunidades **ranqueadas por
potencial real**, cada uma com um gancho de abordagem, que melhora a cada ciclo.

---

# 3. ARQUITETURA DO SISTEMA

## 3.1 Dois serviços, responsabilidades separadas

```
   ┌──────────────────────────────────────┐
   │   GATEWAY  (Node.js / Fastify / TS)   │  ← dono dos dados
   │                                       │
   │   Segurança · Validação · Persistência│
   │   Coleta de fontes · Orquestração     │
   │   Observabilidade                     │
   └──────────────────┬────────────────────┘
                      │ HTTP (resiliente)
                      ▼
   ┌──────────────────────────────────────┐
   │   MOTOR  (Python / FastAPI)           │  ← inteligência stateless
   │                                       │
   │   Estatística · Vetorização · kNN     │
   │   Classificador · Flywheel · LLM      │
   └──────────────────────────────────────┘
```

**Por que dois serviços?** O princípio "cada serviço dono dos seus dados"
(TypeScript Microservices). O gateway cuida de tudo que é API e dados; o motor é
um processador puro de inteligência. Isso isola a stack de ML (Python, ecossistema
de ciência de dados) da stack de API (Node, ecossistema web), e permite escalar
cada uma independentemente. Eles conversam por HTTP — "dumb pipe".

## 3.2 Camadas do Gateway (Node.js)

| Camada | Responsabilidade |
|--------|------------------|
| **Plugins (10)** | config, segurança (helmet/cors/rate-limit), auth (JWT+RBAC), métricas, datasource, services (DI), adapters, motor-client |
| **Rotas (9)** | por bounded context: auth, clientes, perfis, análises, entregas, fontes, admin |
| **Schemas (TypeBox)** | validação runtime de body/params/query, anti mass-assignment |
| **Services (3)** | derivação, análise, coleta — lógica pura, injetada por construtor |
| **Repositories (6)** | memory + PostgreSQL + MongoDB, trocáveis por config |
| **Adapters (4)** | CNPJ (híbrido real/mock), IBGE, Geocoder, Registro de Imóveis — com circuit breaker |
| **Persistência** | PostgreSQL (relacional + RLS), MongoDB (geo 2dsphere), Redis (cache) |

## 3.3 Camadas do Motor (Python)

| Módulo | Fase | O que faz |
|--------|------|-----------|
| `derivacao.py` | 2 | Estatística sobre os bons compradores → critérios ponderados |
| `vectorizer.py` | 3 | Perfil e entidades → vetores comparáveis |
| `knn.py` | 3 | Busca por similaridade (cosine) |
| `classifier.py` | 5 | Prevê probabilidade de conversão (RandomForest) |
| `trainer.py` | 6 | Flywheel: re-treina com feedbacks |
| `embeddings.py` | 7 | Similaridade semântica (opcional, via API) |
| `hooks.py` | 8 | Ganchos de abordagem (template ou LLM+RAG) |
| `tasks.py` | — | Re-treino assíncrono (Celery + Redis) |

## 3.4 Integração entre os serviços

- **Síncrona:** gateway → motor via HTTP, com circuit breaker, retry e timeout.
- **Anti-corruption layer:** traduz camelCase (gateway) ↔ snake_case (motor).
- **Trace distribuído:** o `x-request-id` propaga — mesmo ID nos logs dos dois.
- **Segurança interna:** chave compartilhada (`x-internal-key`).
- **Fallback:** se o motor cai, o gateway usa o serviço de análise local.

## 3.5 Observabilidade (3 pilares)

- **Logs** estruturados (Pino / structlog) com correlation ID.
- **Métricas** Prometheus em `/metrics` nos dois serviços.
- **Tracing** OpenTelemetry, cruzando a fronteira Node ↔ Python.

---

# 4. DIAGRAMA DE SEQUÊNCIA

```mermaid
sequenceDiagram
    actor U as Usuário
    participant GW as Gateway
    participant DB as Bancos
    participant FT as Fontes (CNPJ)
    participant MT as Motor Python

    Note over U,MT: Autenticação
    U->>GW: POST /auth/login {email, senha}
    GW-->>U: 200 {token JWT}

    Note over U,MT: Configuração
    U->>GW: POST /clientes {dados}
    GW->>DB: persiste
    GW-->>U: 201 {clienteId}
    U->>GW: POST /clientes/:id/base-interna {compradores}
    GW->>GW: valida CO2 (>=3 c/ recompra)
    GW->>DB: persiste base
    GW-->>U: 201

    Note over U,MT: Derivação do perfil (local)
    U->>GW: POST /perfis/derivar {clienteId}
    GW->>DB: busca base
    GW->>GW: estatística → critérios
    GW->>DB: persiste perfil
    GW-->>U: 201 {criterios[]}

    Note over U,MT: Lookalike
    U->>GW: POST /analises/executar {clienteId, escopo}
    GW->>DB: busca perfil
    GW->>FT: coleta candidatos
    FT-->>GW: entidades {lat, long, atributos}
    alt Motor disponível
        GW->>MT: POST /analisar {criterios, entidades}
        MT->>MT: kNN + classificador + ganchos
        MT-->>GW: oportunidades ranqueadas
    else Motor offline
        GW->>GW: fallback local
    end
    GW-->>U: 201 {oportunidades[]}

    Note over U,MT: Flywheel
    U->>MT: POST /feedback {resultados}
    MT->>MT: re-treina classificador
    MT->>DB: persiste modelo
    MT-->>U: 202 / 200
```

---

# 5. COMO CONFIGURAR A APLICAÇÃO

## 5.1 Pré-requisitos
- PostgreSQL 15+, MongoDB 7+, Redis 7+
- Node.js 20+ (gateway), Python 3.12+ (motor)

## 5.2 Subir a infraestrutura
```bash
cd api-base
docker compose up -d postgres mongo redis
docker compose ps          # confirmar saúde
```

## 5.3 Configurar variáveis (gateway: `api-base/.env`)

**Obrigatórias:**
```bash
JWT_SECRET=<string forte, mín. 32 caracteres>
DB_ENABLED=true
POSTGRES_URL=postgresql://geolead:senha@localhost:5432/geolead
MONGO_URL=mongodb://geolead:senha@localhost:27017/geolead?authSource=admin
REDIS_URL=redis://localhost:6379
```
**Conexão ao motor:**
```bash
MOTOR_URL=http://localhost:8000
MOTOR_API_KEY=<chave interna, mín. 32 caracteres>
```
**Fontes (opcional — sem isto, usa mock):**
```bash
CNPJ_API_URL=https://sua-api-cnpj.com
CNPJ_API_KEY=<chave>
IBGE_BASE_URL=https://servicodados.ibge.gov.br/api
IDH_MUNICIPAL_DATASET_PATH=data/idh/idh-municipal.json
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT="GeoLead/1.0 (contato@seudominio.com.br)"
NOMINATIM_THROTTLE_MS=1000
SETORES_CENSITARIOS_GEOJSON_PATH=/dados/ibge/setores-joinville.geojson
```

Valide a malha de setores antes de subir:

```bash
npm run validate:setores -- data/ibge/setores/seu-arquivo.geojson
```

Valide o dataset de IDH antes de subir:

```bash
npm run validate:idh -- data/idh/idh-municipal.json
```

Auditoria de enriquecimentos:

```bash
GET /enriquecimentos/compradores?clienteId=<clienteId>
GET /enriquecimentos/compradores?clienteId=<clienteId>&fonte=ibge-censo
```

## 5.4 Configurar variáveis (motor: `geolead-engine/.env`)
```bash
INTERNAL_API_KEY=<A MESMA do MOTOR_API_KEY do gateway>   # crucial: idênticas
RETRAIN_MODE=inline                # ou celery (produção)
# opcionais:
EMBEDDINGS_ENABLED=false           # true + EMBEDDINGS_API_KEY p/ semântica
HOOKS_LLM_ENABLED=false            # true + LLM_API_KEY p/ ganchos com LLM
```

## 5.5 Migrations e subida
```bash
cd api-base && npm run migrate     # cria schema + RLS (idempotente)
npm run build && npm start         # gateway na porta 3000

python3 -m pip install --target .pydeps -r requirements.txt
PYTHONPATH=.pydeps python3 -m uvicorn app.main:app --port 8000   # motor

# worker (só se RETRAIN_MODE=celery):
PYTHONPATH=.pydeps python3 -m celery -A app.ml.tasks._celery_app worker -P solo
```

> Se `python3 -m venv` estiver disponível no ambiente, você pode usar virtualenv
> normalmente. Neste repositório, `.pydeps` existe para manter o motor executável
> mesmo em ambientes sem `python3-venv`.

## 5.6 Verificar saúde
```bash
curl http://localhost:3000/health   # gateway
curl http://localhost:8000/health   # motor
```

> **Regra de ouro:** `MOTOR_API_KEY` (gateway) e `INTERNAL_API_KEY` (motor) DEVEM
> ser idênticas — é o segredo que autentica as chamadas internas. As chaves de
> APIs externas (CNPJ, embeddings, LLM) são opcionais: sem elas, o sistema usa
> mock/numérico/template e continua funcionando.

---

# 6. SEQUÊNCIA OPERACIONAL DO USUÁRIO

O loop de valor é **importar → derivar → analisar → agir → dar feedback → repetir**.
Cada volta usa o aprendizado da anterior.

```
1. Login                  obtém o token
2. Cadastrar cliente      cria o franqueado
3. Importar base interna  quem já compra (mín. 3 c/ recompra)
4. Derivar perfil         o sistema extrai o "cliente ideal"
5. Executar lookalike     acha os parecidos nas fontes
6. Ver oportunidades      lista ranqueada + gancho de abordagem
7. Abordar e dar feedback quem converteu / não  → FLYWHEEL
8. Re-analisar            agora mais preciso → volta ao passo 5
```

O ciclo de aprendizado (7→8→5) é o que diferencia o GeoLead: ele não é uma
consulta única, é um sistema que melhora com o uso.

---

# 7. AS ROTAS DA API — DETALHADAS

Sequência completa do login ao flywheel. Todas (exceto login) exigem o header
`Authorization: Bearer <token>`.

---

## 7.1 — `POST /auth/login`
**Autenticação.** Primeira chamada. Rate limit agressivo (anti brute-force).

**Body:**
```json
{ "email": "alice@example.com", "password": "alice-secret-123" }
```
- `email`: formato email, máx. 254 caracteres
- `password`: 1 a 128 caracteres
- `additionalProperties: false` — campos extras (ex.: `role: "admin"`) são
  rejeitados (anti mass-assignment)

**Resposta 200:** `{ "token": "eyJhbGc..." }`
**Resposta 401:** `{ statusCode, error, message: "Credenciais inválidas." }`
(mensagem genérica — não revela se o email existe, anti-enumeração)

---

## 7.2 — `GET /auth/me`
**Identidade do usuário logado.** Valida o token e devolve os dados do usuário.
Útil para o front confirmar a sessão.

**Headers:** `Authorization: Bearer <token>`
**Resposta 200:** dados do usuário (id, email, role)
**Resposta 401:** token ausente/inválido/expirado

---

## 7.3 — `POST /clientes`
**Cadastra um cliente (franqueado).** Guarde o `id` retornado.

**Body:**
```json
{
  "razaoSocial": "Colchões Bom Sono",
  "segmento": "colchao",
  "cidade": "Joinville",
  "vertical": "varejo_colchao",
  "endereco": "Rua X, 100",
  "parametrosNegocio": {}
}
```
- `razaoSocial`, `segmento`, `cidade`, `vertical`: obrigatórios
- `endereco`, `parametrosNegocio`: opcionais

**Resposta 201:** `{ id, razaoSocial, ... }`

---

## 7.4 — `GET /clientes` e `GET /clientes/:id`
**Lista** todos os clientes ou **busca** um pelo id.

**Resposta 200 (lista):** array de clientes
**Resposta 200 (:id):** o cliente
**Resposta 404:** cliente inexistente

---

## 7.4b — `PATCH /clientes/:id`
**Atualiza parcialmente** um cliente. Todos os campos são opcionais — envia só o
que muda.

**Body (todos opcionais):**
```json
{
  "razaoSocial": "Novo Nome",
  "segmento": "colchao",
  "cidade": "Blumenau",
  "endereco": "Rua Nova, 50",
  "parametrosNegocio": {}
}
```
- `additionalProperties: false` — campos não previstos são rejeitados

**Resposta 200:** o cliente atualizado
**Resposta 404:** cliente inexistente

---

## 7.5 — `POST /clientes/:id/base-interna`
**Importa a base interna** (quem já compra). É o insumo da inteligência.

**Body:**
```json
{
  "periodo": "2024-12",
  "compradores": [
    {
      "identificador": "CNPJ12345678000190",
      "nome": "Hotel Bela Vista",
      "tipo": "pj",
      "atributosOriginais": { "cnae": "5510801", "porte": 3 },
      "ticketMedio": 12000,
      "frequencia": 4,
      "ativo": true
    }
  ]
}
```
- `compradores`: mín. 1 item. Cada um:
  - `tipo`: `pj` | `pf` | `territorio`
  - `atributosOriginais`: objeto livre (CNAE, porte, etc.)
  - `frequencia`: nº de recompras (inteiro ≥ 0)
  - `ativo`: boolean

**Resposta 201:** confirmação da importação
> **Atenção (pré-condição CO2):** a derivação seguinte exige **≥ 3 compradores
> ativos com `frequencia >= 2`**. Importe uma base que satisfaça isso.

---

## 7.6 — `POST /perfis/derivar`
**Deriva o perfil ideal** a partir da base. Processamento estatístico **local no
gateway** (não passa pelo motor). Extrai critérios ponderados por consistência.

**Body:**
```json
{ "clienteId": "<id>", "tipoAlvo": "pj", "nome": "Perfil Hotelaria" }
```
- `tipoAlvo`: `pj` | `pf` | `territorio` (default `pj`)
- `nome`: opcional

**Resposta 201:**
```json
{
  "id": "<perfilId>",
  "clienteId": "<id>",
  "tipo": "pj",
  "criterios": [
    { "nome": "cnae", "valorMin": ["5510801"], "valorMax": ["5510801"],
      "peso": 0.27, "tipoComparacao": "enum" },
    { "nome": "porte", "valorMin": 2, "valorMax": 4,
      "peso": 0.20, "tipoComparacao": "range" }
  ]
}
```
**Resposta 404:** base interna não importada
**Resposta 422:** menos de 3 compradores com recompra (viola CO2)

---

## 7.7 — `GET /perfis` e `GET /perfis/:id`
**Lista** perfis ou **busca** um. Útil para revisar o perfil antes de analisar.

---

## 7.8 — `POST /analises/executar`
**O lookalike.** O gateway busca o perfil, **coleta candidatos das fontes**, e
**delega ao motor Python** a análise. Se o motor cai, usa fallback local.

**Body:**
```json
{ "clienteId": "<id>", "escopo": "Joinville", "limiarSimilaridade": 0.3 }
```
- `escopo`: município/região alvo (1 a 200 caracteres)
- `limiarSimilaridade`: 0 a 1 (default 0.3) — corta oportunidades fracas

**Fluxo interno:**
1. busca os critérios do perfil (DB)
2. `coletaService` consulta o adapter de CNPJ (CNAE + município)
3. traduz para snake_case e chama `motor.analisar` (com trace context)
4. motor faz kNN + classificador + ganchos
5. anti-corruption layer traduz de volta para camelCase

**Resposta 201:**
```json
{
  "id": "<analiseId>",
  "tipo": "lookalike",
  "escopo": "Joinville",
  "versaoModelo": "0.1.0",
  "totalOportunidades": 3,
  "oportunidades": [
    {
      "entidadeAlvoId": "cnpj-001",
      "tipo": "pj",
      "prioridade": "alta",
      "justificativa": "85% de similaridade com o perfil ideal.",
      "ganchoAbordagem": "Hotel Panorama tem 85% de compatibilidade...",
      "score": { "valor": 0.85, "similaridade": 0.85, "probConversao": 0.68 }
    }
  ],
  "createdAt": "2024-12-01T10:00:00Z"
}
```
> **Nota (gap do front):** a resposta hoje **não inclui lat/long** das
> oportunidades — necessário para o mapa. O gateway tem os dados (da coleta), só
> falta repassá-los. É um ajuste pendente para a aplicação de mapas.

---

## 7.9 — `GET /analises/:id`
**Recupera uma análise** já executada (para revisitar oportunidades).

---

## 7.10 — `POST /entregas` e `GET /entregas/:id`
**Gerencia entregas** (o pacote de oportunidades entregue ao cliente).

---

## 7.11 — `POST /entregas/:id/feedback`
**Registra a conversão** e fecha o flywheel pelo gateway.

> **Estado real:** o gateway persiste o feedback localmente e, quando o motor
> está habilitado e há resultados, encaminha o lote ao `MotorClient.feedback()`.
> O motor re-treina inline ou via fila, conforme configuração.

**Contrato enviado ao motor:**
```json
POST http://localhost:8000/feedback
{
  "feedback_id": "<id do feedback>",
  "cliente_id": "<id>",
  "resultados": [
    { "entidade_alvo_id": "cnpj-001", "converteu": true,
      "atributos": { "cnae": "5510801", "porte": 3 } }
  ]
}
```
O motor acumula o histórico, re-treina o classificador (síncrono ou via fila) e
persiste o modelo. O envio é idempotente por `feedback_id`. **Resposta 202**
(enfileirado) ou **200** (inline).

---

## 7.12 — Rotas de Fontes de dados (adapters como API)

Expõem os adapters de fontes externas diretamente. São o ponto de coleta que o
fluxo de análise usa internamente, mas também consultáveis de forma avulsa.

### `GET /fontes`
**Lista as fontes disponíveis**, o modo operacional de cada adapter e o estado
do circuit breaker.

**Resposta 200:**
```json
[
  { "nome": "cnpj-receita-federal", "modo": "mock", "circuitState": "closed" },
  { "nome": "ibge-censo", "modo": "mock", "circuitState": "closed" }
]
```
(`modo`: `real` = integração externa ativa, `mock` = fixture local, `hibrido` =
suporta integração real mas continua operando com fallback local)
(`circuitState`: `closed` = saudável, `open` = fonte indisponível, `half-open` =
testando recuperação)

As consultas e enriquecimentos de fontes usam cache-aside com TTL definido por
`CACHE_TTL_SECONDS`. Quando `REDIS_URL` está configurado, o cache usa Redis;
sem Redis, usa memória local.

No estado atual, `CNPJ` e `IBGE` têm caminho real quando configurados. `IBGE`
usa a API pública do IBGE para Localidades e Agregados, retornando população,
PIB municipal em mil reais e PIB per capita estimado; `Geocoder` e
`Registro de Imóveis` permanecem em mock.

### `POST /fontes/:fonte/consultar`
**Consulta uma fonte** por critérios. `:fonte` ∈ `cnpj | ibge | geocoder |
registro-imoveis`.

**Body:**
```json
{ "parametros": { "cnaes": ["5510801"], "municipio": "Joinville", "limit": 50 } }
```

**Resposta 200:**
```json
{ "fonte": "cnpj-receita-federal", "total": 3, "resultados": [ ... ] }
```
**Resposta 400:** parâmetros inválidos
**Resposta 503:** fonte indisponível (circuit breaker aberto)

### `POST /fontes/:fonte/enriquecer`
**Enriquece uma entidade** com dados detalhados da fonte (ex.: dado completo de
um CNPJ específico).

**Body:** `{ "identificador": "12345678000190" }`
**Resposta 200:** os dados enriquecidos da entidade

---

## 7.13 — `GET /admin/stats`
**Estatísticas administrativas** do sistema (visão operacional).

**Resposta 200:**
```json
{ "totalClientes": 0, "totalAnalises": 0, "uptime": 3600 }
```
> **Nota:** `totalClientes` é agregado do repositório real. `totalAnalises` retorna
> 0 até que um método de contagem seja adicionado à interface `IAnaliseRepository`.
> O `uptime` (segundos desde o boot) é real.

---

## 7.14 — `GET /`
**Raiz da API** — informação básica de status. Útil como ping inicial.

**Resposta 200:** `{ "name": "...", "status": "ok", ... }`

---

## 7.15 — Endpoints de infraestrutura
- `GET /health` — liveness (gateway e motor)
- `GET /metrics` — métricas Prometheus (gateway e motor)
- `GET /docs` — OpenAPI/Swagger (motor)

---

## 7.16 — Rotas de demonstração de segurança (NÃO fazem parte do fluxo de uso)

Estas rotas existem **apenas para demonstrar e testar as defesas OWASP** — não
são parte da jornada do usuário nem do produto. Documentadas aqui só para
completude.

### `GET /documents/:id`  — demo de defesa BOLA (API1)
Demonstra o *ownership check*: além de autenticar, verifica que o documento
pertence ao usuário do token. Trocar o `:id` para acessar recurso de outro
usuário retorna **403**, não os dados. É o que os testes OWASP validam.

### `POST /fetch-remote`  — demo de defesa SSRF
Demonstra o `ssrf-guard`: valida a URL de saída (`validateOutboundUrl`) antes de
buscar, bloqueando tentativas de acessar IPs internos/metadata. Recusa URLs
maliciosas.

> Em produção, estas rotas seriam removidas ou mantidas só no ambiente de teste.

---

## 7.17 — Alertas de oportunidade

Monitora novas entidades no escopo e notifica quando uma bate com o perfil ideal
do cliente. O ciclo é: escanear → listar → atualizar status.

### `POST /alertas/escanear`
Varre o escopo indicado e gera alertas para entidades novas com score ≥ `limiar`.

**Body:**
```json
{
  "clienteId": "uuid",
  "escopo": "SP - Guarulhos",
  "limiar": 0.5
}
```

**Resposta 200:**
```json
{
  "alertasGerados": [
    {
      "id": "uuid",
      "clienteId": "uuid",
      "tipo": "oportunidade",
      "entidadeAlvoId": "uuid",
      "entidadeNome": "Hotel Central",
      "entidadeCidade": "Guarulhos",
      "score": 0.82,
      "mensagem": "Entidade com alto potencial no escopo SP - Guarulhos.",
      "status": "novo",
      "criadoEm": "2026-01-01T10:00:00Z"
    }
  ],
  "totalEscaneadas": 47
}
```

---

### `GET /alertas?clienteId=&status=`
Lista alertas do cliente. O parâmetro `status` é opcional:
`novo` | `visto` | `descartado` | `convertido`.

**Resposta 200:** array de alertas (mesmo formato de item acima).

---

### `PATCH /alertas/:id`
Atualiza o status de um alerta. Só o dono do cliente pode operar.

**Body:**
```json
{ "status": "convertido" }
```

**Resposta 200:**
```json
{ "id": "uuid", "status": "convertido" }
```

---

## 7.18 — `POST /raio-x`
**Retrato do cliente ideal** — análise exploratória sem necessitar de perfil
salvo. Recebe a lista de compradores e devolve fatores determinantes, estatísticas
e potencial de mercado.

**Body:**
```json
{
  "compradores": [
    { "id": "c1", "segmento": "hotel", "cidade": "SP", "uf": "SP", ... }
  ]
}
```

**Resposta 200:**
```json
{
  "retrato": {
    "frase": "Hotéis e pousadas com recompra frequente no interior paulista.",
    "complemento": "Ticket médio de R$ 4.200, 68% com mais de uma compra."
  },
  "fatores": [
    { "atributo": "segmento", "pesoPercentual": 42, "descricao": "Hotéis e pousadas representam 72% da base." }
  ],
  "estatisticas": {
    "totalClientes": 30, "ativos": 28, "comRecompra": 20,
    "percentualFieis": 67, "ticketMedio": 4200
  },
  "segmentos": [
    { "segmento": "hotel", "quantidade": 22, "percentual": 73 }
  ],
  "potencial": {
    "mensagem": "Mercado endereçável estimado em 1.200 empresas.",
    "cta": "Executar análise lookalike para identificar os mais similares."
  }
}
```

> Requer o motor Python. Retorna **503** se o motor estiver indisponível.
> Retorna **422** se o payload tiver dados insuficientes para a análise.

---

## 7.19 — `POST /competitiva/analisar`
**Análise do cenário competitivo** de uma região. Infere fornecedores concorrentes
por CNAE compatível com o perfil ideal do cliente e avalia a concentração do
mercado local.

**Body:**
```json
{ "clienteId": "uuid", "regiao": "Campinas - SP" }
```

**Resposta 200:**
```json
{
  "clienteId": "uuid",
  "regiao": "Campinas - SP",
  "concorrentes": [
    {
      "nome": "Distribuidora X",
      "identificador": "12.345.678/0001-90",
      "cnae": "4649-4/08",
      "cidade": "Campinas",
      "distanciaEstimada": 12.5,
      "presenca": ["e-commerce", "loja física"]
    }
  ],
  "totalFornecedoresRegiao": 38,
  "concentracao": "moderada",
  "insight": "Mercado moderadamente concentrado; há espaço para diferenciação por preço ou prazo."
}
```

---

## 7.20 — `POST /territorio/analisar`
**Potencial de expansão territorial.** Compara múltiplas regiões por volume de
entidades não atendidas pelo perfil ideal e recomenda a área com maior retorno.

**Body:**
```json
{
  "clienteId": "uuid",
  "regioes": ["Campinas - SP", "Ribeirão Preto - SP", "Sorocaba - SP"],
  "limiar": 0.3
}
```

**Resposta 200:**
```json
{
  "clienteId": "uuid",
  "regioesAnalisadas": 3,
  "regioes": [
    {
      "nome": "Campinas - SP",
      "totalEntidades": 120,
      "naoAtendidos": 87,
      "potencialMedio": 0.61,
      "scoreMaisAlto": 0.94,
      "cobertura": 0.28,
      "oportunidadesTop3": [
        { "nome": "Hotel Central", "identificador": "12.345.678/0001-90", "score": 0.94 }
      ]
    }
  ],
  "regiaoRecomendada": "Campinas - SP"
}
```

---

## Resumo da sequência (cola rápida)

**Jornada principal (do login ao flywheel):**

| # | Rota | Método | Papel |
|---|------|--------|-------|
| 1 | `/auth/login` | POST | autenticar |
| 2 | `/auth/me` | GET | confirmar sessão |
| 3 | `/clientes` | POST | cadastrar franqueado |
| 4 | `/clientes/:id/base-interna` | POST | importar quem compra |
| 5 | `/perfis/derivar` | POST | derivar perfil ideal (CO2) |
| 6 | `/analises/executar` | POST | lookalike → oportunidades |
| 7 | `/entregas/:id/feedback` | POST | feedback → flywheel* |

\* hoje via motor diretamente

**Rotas de apoio (CRUD, consulta, admin):**

| Rota | Método | Papel |
|------|--------|-------|
| `/clientes` | GET | listar clientes |
| `/clientes/:id` | GET | buscar cliente |
| `/clientes/:id` | PATCH | atualizar cliente |
| `/perfis` `/perfis/:id` | GET | listar / buscar perfil |
| `/analises/:id` | GET | recuperar análise |
| `/entregas` `/entregas/:id` | POST/GET | gerenciar entregas |
| `/fontes` | GET | listar fontes + circuit state |
| `/fontes/:fonte/consultar` | POST | consultar fonte avulsa |
| `/fontes/:fonte/enriquecer` | POST | enriquecer entidade |
| `/admin/stats` | GET | estatísticas do sistema |
| `/` `/health` `/metrics` | GET | infraestrutura |

**Inteligência e expansão:**

| Rota | Método | Papel |
|------|--------|-------|
| `/raio-x` | POST | retrato do cliente ideal (motor) |
| `/alertas/escanear` | POST | detectar novas oportunidades |
| `/alertas` | GET | listar alertas por status |
| `/alertas/:id` | PATCH | marcar alerta como visto/convertido |
| `/competitiva/analisar` | POST | cenário competitivo de uma região |
| `/territorio/analisar` | POST | recomendar melhor região de expansão |

**Demonstração de segurança (fora do fluxo de uso):**

| Rota | Método | Papel |
|------|--------|-------|
| `/documents/:id` | GET | demo defesa BOLA |
| `/fetch-remote` | POST | demo defesa SSRF |

---

# 8. ESTADO ATUAL E PRÓXIMOS PASSOS

## Pronto e validado
- Gateway: 202 testes (120 unitários + 59 integração + 23 OWASP), typecheck limpo, 0 vulnerabilidades
- Motor: 66 testes, 8 fases de inteligência, flywheel com fila real
- Integração HTTP validada com os dois serviços rodando
- **Total: 268 testes**

## Pendências para produção (honestidade)
| Item | Situação |
|------|----------|
| Enriquecimento CNPJ real | adapter combina ReceitaWS + BrasilAPI; configurar `RECEITAWS_BASE_URL` e `BRASILAPI_BASE_URL` |
| API real do IBGE | adapter híbrido pronto; configurar `IBGE_BASE_URL` |
| IDH municipal | dataset estático opcional pronto; configurar `IDH_MUNICIPAL_DATASET_PATH` |
| Geocoder real | adapter híbrido Nominatim pronto; configurar `NOMINATIM_BASE_URL` e `NOMINATIM_USER_AGENT` |
| Setor censitário | resolvedor GeoJSON pronto; configurar malha IBGE recortada em `SETORES_CENSITARIOS_GEOJSON_PATH` |
| Chaves de embeddings/LLM | estrutura pronta; falta preencher |
| MongoDB contra instância real | repo compila; não exercido (indisponível no ambiente de dev) |
| Fontes externas restantes | Registro de Imóveis ainda opera em mock |
| Multi-tenant (JWT + RLS) | ownership HTTP e contexto transacional implementados |
| Gestão de usuários | CRUD via `/admin/usuarios`; auth ainda usa fixtures em dev, tabela `usuarios` em prod |
| Teste de carga | nunca rodou sob volume real |

## Caminho recomendado para um piloto real
1. Plugar uma API real de CNPJ (destrava dados verdadeiros)
2. Habilitar `IBGE_BASE_URL` em homologação e validar Localidades/Agregados
3. Habilitar Nominatim com User-Agent real e respeitar 1 req/s
4. Exercer o MongoDB contra instância real
5. Substituir autenticação hard-coded e rodar teste de carga

A fundação de engenharia está sólida; o que falta é, em grande parte,
configuração e conexão com o mundo real — não reconstrução.
