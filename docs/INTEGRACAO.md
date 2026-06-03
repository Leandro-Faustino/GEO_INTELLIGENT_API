# Integração Gateway e Motor

O gateway Node.js e o motor Python se comunicam por HTTP síncrono. O gateway
continua dono dos dados, da autenticação, da validação e da persistência; o
motor processa inteligência de forma stateless.

## Componentes

- `src/adapters/motor.client.ts`: cliente HTTP resiliente e tipado para
  `/analisar`, `/raio-x` e `/feedback`, reaproveitando `BaseAdapter`.
- `src/plugins/49-motor.ts`: injeta `fastify.motor` quando `MOTOR_URL` está
  configurada; com URL vazia, o gateway usa fallback local.
- `src/routes/analises/analises.routes.ts`: delega o lookalike ao motor quando
  disponível e persiste a análise retornada.
- `src/routes/entregas/entregas.routes.ts`: persiste feedback localmente e
  depois aciona o flywheel do motor sem perder o registro do gateway.
- `src/routes/raio-x/raio-x.routes.ts`: delega o raio-x ao motor com tratamento
  padronizado de erros.

## Configuração

- `MOTOR_URL`: URL base do motor Python. Vazio desabilita a integração.
- `MOTOR_API_KEY`: chave interna enviada em `x-internal-key`.
- `MOTOR_TIMEOUT_MS`: timeout das chamadas ao motor.

## Fontes Externas

- `CNPJ_API_URL`: habilita o modo híbrido do adapter CNPJ.
- `IBGE_BASE_URL`: habilita o modo híbrido do adapter IBGE. Valor recomendado:
  `https://servicodados.ibge.gov.br/api`.
- `IDH_MUNICIPAL_DATASET_PATH`: caminho local para dataset JSON de IDH
  municipal. Quando configurado, o IBGE real adiciona `idh` e `idhAno` ao
  enriquecimento municipal.
- `NOMINATIM_BASE_URL`: habilita o modo híbrido do Geocoder. Valor recomendado:
  `https://nominatim.openstreetmap.org`.
- `NOMINATIM_USER_AGENT`: obrigatório para Nominatim público; use um valor
  identificável com contato real da aplicação.
- `NOMINATIM_THROTTLE_MS`: intervalo global entre chamadas ao Nominatim. Para
  o serviço público mantenha `1000` para respeitar 1 requisição por segundo.
- `SETORES_CENSITARIOS_GEOJSON_PATH`: caminho local para GeoJSON de setores
  censitários do IBGE. Quando configurado, o Geocoder cruza `latitude/longitude`
  com a malha e preenche `setorCensitario`; quando vazio, mantém `null`.
- Sem essas URLs, os adapters continuam operando em mock local.

### Setores censitários

O Nominatim não fornece setor censitário. Esse campo é resolvido por
point-in-polygon usando a Malha de Setores Censitários do IBGE. Em produção,
use arquivos recortados por município/UF ou uma base espacial própria; carregar
a malha nacional completa em memória no gateway não é recomendado. O GeoJSON
deve conter `Polygon` ou `MultiPolygon` em coordenadas `[longitude, latitude]`
e uma propriedade de código como `CD_SETOR`, `CD_SETOR_2022`, `CD_GEOCODI`,
`GEOCODIGO`, `cod_setor`, `codigoSetor` ou `setorCensitario`.

Fluxo operacional recomendado:

1. Baixe a malha oficial no portal do IBGE.
2. Recorte por município/UF piloto antes de usar no gateway.
3. Converta para GeoJSON em WGS84 (`EPSG:4326`) mantendo coordenadas
   `[longitude, latitude]`.
4. Salve em `data/ibge/setores/`.
5. Valide o arquivo:

```bash
npm run validate:setores -- data/ibge/setores/seu-arquivo.geojson
```

6. Configure `SETORES_CENSITARIOS_GEOJSON_PATH` com o caminho validado.

O boot da aplicação registra `warn` se o caminho configurado estiver ausente ou
inválido. O comando de validação deve ser usado em CI/deploy para bloquear
arquivos ruins antes de publicar.

### IDH municipal

O IDH municipal não é entregue pela API do IBGE. Para manter o contrato
honesto, ele é tratado como dataset estático opcional. O JSON deve conter uma
lista de registros com `codigoIbge`, `municipio`, `uf`, `idh`, e opcionalmente
`ano` e `fonte`.

Exemplo:

```json
[
  {
    "codigoIbge": 4209102,
    "municipio": "Joinville",
    "uf": "SC",
    "idh": 0.809,
    "ano": 2010,
    "fonte": "Atlas do Desenvolvimento Humano"
  }
]
```

Valide antes de usar:

```bash
npm run validate:idh -- data/idh/idh-municipal.json
```

Depois configure `IDH_MUNICIPAL_DATASET_PATH`. Se o dataset não estiver
configurado, o IBGE real continua funcionando sem `idh`.

## Auditoria dos enriquecimentos

Cada execução de `/perfis/enriquecer` persiste o resultado por comprador e por
fonte em `enriquecimentos_compradores`. O objetivo é rastrear quais payloads
externos sustentaram o perfil enriquecido.

Endpoint:

```http
GET /enriquecimentos/compradores?clienteId={clienteId}
GET /enriquecimentos/compradores?clienteId={clienteId}&fonte=ibge-censo
GET /enriquecimentos/compradores?clienteId={clienteId}&compradorIdentificador=123
```

Contrato de cada item:

```json
{
  "id": "uuid",
  "clienteId": "uuid",
  "compradorIdentificador": "12345678000190",
  "compradorNome": "Hotel Bela Vista",
  "fonte": "ibge-censo",
  "status": "sucesso",
  "payload": { "populacao": 616317, "idh": 0.809 },
  "erro": "",
  "createdAt": "2026-05-30T00:00:00.000Z",
  "expiresAt": "2026-06-29T00:00:00.000Z"
}
```

Falhas também são persistidas com `status: "falha"`, `payload: {}` e a mensagem
normalizada em `erro`.

## Resiliência

O `MotorClient` herda timeout, retry com backoff e circuit breaker do
`BaseAdapter`. Falhas de infraestrutura viram `MotorIndisponivelError`; em
análise o gateway cai para o service local, e em feedback o dado ja ficou
persistido antes da tentativa de envio ao motor.

## Observabilidade

O gateway propaga `x-request-id` para o motor. O mesmo ID aparece nos dois
serviços, permitindo rastrear a chamada cruzando a fronteira Node.js -> Python.
