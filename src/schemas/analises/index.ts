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
    limiarSimilaridade: Type.Optional(
      Type.Number({ minimum: 0, maximum: 1, default: 0.3 }),
    ),
  },
  {
    $id: 'schema:geolead:analises:executar-body',
    additionalProperties: false,
  },
)

export const AnaliseResponse = Type.Object(
  {
    id: Type.String(),
    tipo: Type.String(),
    escopo: Type.String(),
    versaoModelo: Type.String(),
    totalOportunidades: Type.Integer(),
    oportunidades: Type.Array(OportunidadeSchema),
    ...Timestamps,
  },
  { $id: 'schema:geolead:analises:response' },
)

export const analiseSchemas = [ExecutarLookalikeBody, AnaliseResponse]
