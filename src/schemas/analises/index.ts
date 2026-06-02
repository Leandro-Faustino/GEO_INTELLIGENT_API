/**
 * Schemas do bounded context: Analise + Oportunidade + Score.
 */
import { Type } from '@sinclair/typebox'
import { Timestamps } from '../shared/index.js'

export const ScoreSchema = Type.Object({
  valor: Type.Number({ minimum: 0, maximum: 1 }),
  similaridade: Type.Number({ minimum: 0, maximum: 1 }),
  probConversao: Type.Number({ minimum: 0, maximum: 1 }),
})

export const OportunidadeSchema = Type.Object({
  id: Type.String(),
  entidadeAlvoId: Type.String(),
  tipo: Type.String(),
  justificativa: Type.String(),
  ganchoAbordagem: Type.String(),
  prioridade: Type.String({ enum: ['alta', 'media', 'baixa'] }),
  score: ScoreSchema,
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

export const analiseSchemas = [ExecutarLookalikeBody, AnaliseResponse, AnaliseListResponse]
