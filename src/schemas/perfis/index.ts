/**
 * Schemas do bounded context: PerfilIdeal + CriterioDerivado.
 */
import { Type } from '@sinclair/typebox'
import { Timestamps } from '../shared/index.js'

export const CriterioDerivadoSchema = Type.Object({
  nome: Type.String({ maxLength: 100 }),
  valorMin: Type.Unknown(),
  valorMax: Type.Unknown(),
  peso: Type.Number({ minimum: 0, maximum: 1 }),
  tipoComparacao: Type.String({
    enum: ['range', 'enum', 'distancia', 'booleano'],
  }),
})

export const DerivarPerfilBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    tipoAlvo: Type.String({
      enum: ['pj', 'pf', 'territorio'],
      default: 'pj',
    }),
    nome: Type.Optional(Type.String({ maxLength: 200 })),
  },
  {
    $id: 'schema:geolead:perfis:derivar-body',
    additionalProperties: false,
  },
)

export const PerfilResponse = Type.Object(
  {
    id: Type.String(),
    clienteId: Type.String(),
    nome: Type.String(),
    tipo: Type.String(),
    hipotetico: Type.Boolean(),
    criterios: Type.Array(CriterioDerivadoSchema),
    exclusoes: Type.Array(Type.String()),
    ...Timestamps,
  },
  { $id: 'schema:geolead:perfis:response' },
)

export const perfilSchemas = [DerivarPerfilBody, PerfilResponse]
