/**
 * Schemas do bounded context: Entrega + Feedback.
 */
import { Type } from '@sinclair/typebox'
import { Timestamps } from '../shared/index.js'

export const MontarEntregaBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    periodo: Type.String({ minLength: 1, maxLength: 50 }),
    formato: Type.String({
      enum: ['planilha', 'pdf', 'dashboard', 'api'],
      default: 'planilha',
    }),
  },
  {
    $id: 'schema:geolead:entregas:montar-body',
    additionalProperties: false,
  },
)

export const FeedbackBody = Type.Object(
  {
    exclusoes: Type.Optional(Type.Array(Type.String())),
    ajustes: Type.Optional(
      Type.Array(
        Type.Object({
          criterio: Type.String(),
          novoPeso: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
          novoMin: Type.Optional(Type.Unknown()),
          novoMax: Type.Optional(Type.Unknown()),
        }),
      ),
    ),
    resultados: Type.Optional(
      Type.Array(
        Type.Object({
          entidadeAlvoId: Type.String(),
          converteu: Type.Boolean(),
          ticketReal: Type.Optional(Type.Number({ minimum: 0 })),
        }),
      ),
    ),
    observacoes: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  {
    $id: 'schema:geolead:entregas:feedback-body',
    additionalProperties: false,
  },
)

export const EntregaResponse = Type.Object(
  {
    id: Type.String(),
    tipo: Type.String(),
    periodo: Type.String(),
    formato: Type.String(),
    totalOportunidades: Type.Integer(),
    ...Timestamps,
  },
  { $id: 'schema:geolead:entregas:response' },
)

export const entregaSchemas = [MontarEntregaBody, FeedbackBody, EntregaResponse]
