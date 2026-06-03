/**
 * Schemas do bounded context: Analise + Oportunidade + Score + Mapa.
 */
import { Type } from '@sinclair/typebox'
import { Timestamps } from '../shared/index.js'

export const ScoreSchema = Type.Object({
  valor: Type.Number({ minimum: 0, maximum: 1 }),
  similaridade: Type.Number({ minimum: 0, maximum: 1 }),
  probConversao: Type.Number({ minimum: 0, maximum: 1 }),
})

const FaixaScoreSchema = Type.Union([
  Type.Literal('alta'),
  Type.Literal('media'),
  Type.Literal('baixa'),
])

export const OportunidadeSchema = Type.Object({
  id: Type.String(),
  entidadeAlvoId: Type.String(),
  // legacy fields (backward compat)
  entidadeNome: Type.String(),
  entidadeCidade: Type.String(),
  latitude: Type.Union([Type.Number(), Type.Null()]),
  longitude: Type.Union([Type.Number(), Type.Null()]),
  // canonical map fields
  nome: Type.String(),
  endereco: Type.String(),
  lat: Type.Union([Type.Number(), Type.Null()]),
  lon: Type.Union([Type.Number(), Type.Null()]),
  faixaScore: FaixaScoreSchema,
  tipo: Type.String(),
  justificativa: Type.String(),
  ganchoAbordagem: Type.String(),
  prioridade: Type.String({ enum: ['alta', 'media', 'baixa'] }),
  score: ScoreSchema,
})

const CentroMapaSchema = Type.Object({
  lat: Type.Number(),
  lon: Type.Number(),
  zoom: Type.Integer(),
})

export const ExecutarLookalikeBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    escopo: Type.String({ minLength: 1, maxLength: 200 }),
    perfilId: Type.Optional(Type.String({ minLength: 1 })),
    tipoAlvo: Type.Optional(
      Type.Union([Type.Literal('pj'), Type.Literal('pf'), Type.Literal('territorio')]),
    ),
    limiarSimilaridade: Type.Optional(
      Type.Number({ minimum: 0, maximum: 1, default: 0.3 }),
    ),
  },
  {
    $id: 'schema:geolead:analises:executar-body',
    additionalProperties: false,
  },
)

const OrigemSchema = Type.Optional(
  Type.Union([Type.Literal('motor'), Type.Literal('local')]),
)

export const AnaliseResponse = Type.Object(
  {
    id: Type.String(),
    clienteId: Type.String(),
    perfilId: Type.Optional(Type.String()),
    tipo: Type.String(),
    escopo: Type.String(),
    versaoModelo: Type.String(),
    origem: OrigemSchema,
    totalOportunidades: Type.Integer(),
    centroMapa: Type.Optional(Type.Union([CentroMapaSchema, Type.Null()])),
    oportunidades: Type.Array(OportunidadeSchema),
    ...Timestamps,
  },
  { $id: 'schema:geolead:analises:response' },
)

export const AnaliseListItemSchema = Type.Object({
  id: Type.String(),
  clienteId: Type.String(),
  perfilId: Type.Optional(Type.String()),
  tipo: Type.String(),
  escopo: Type.String(),
  versaoModelo: Type.String(),
  origem: OrigemSchema,
  totalOportunidades: Type.Integer(),
  ...Timestamps,
})

export const AnaliseListResponse = Type.Object(
  {
    total: Type.Integer(),
    items: Type.Array(AnaliseListItemSchema),
  },
  { $id: 'schema:geolead:analises:list-response' },
)

// ─── Mapa ─────────────────────────────────────────────────────────────────────

const MapaEntidadeSchema = Type.Object({
  identificador: Type.String(),
  nome: Type.String(),
  endereco: Type.String(),
  lat: Type.Union([Type.Number(), Type.Null()]),
  lon: Type.Union([Type.Number(), Type.Null()]),
  score: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  faixaScore: Type.Union([FaixaScoreSchema, Type.Null()]),
  jaCliente: Type.Boolean(),
})

export const MapaResponseSchema = Type.Object(
  {
    analiseId: Type.String(),
    centroMapa: Type.Union([CentroMapaSchema, Type.Null()]),
    totalEntidades: Type.Integer({ minimum: 0 }),
    entidades: Type.Array(MapaEntidadeSchema),
  },
  {
    $id: 'schema:geolead:analises:mapa-response',
    additionalProperties: false,
  },
)

export const analiseSchemas = [
  ExecutarLookalikeBody,
  AnaliseResponse,
  AnaliseListResponse,
  MapaResponseSchema,
]
