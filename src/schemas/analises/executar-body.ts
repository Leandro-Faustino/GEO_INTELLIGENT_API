import { Type } from '@sinclair/typebox'

export const AnaliseExecutarBodySchema = Type.Object(
  {
    clienteId: Type.String({ minLength: 1, maxLength: 64 }),
    perfilId: Type.String({ minLength: 1, maxLength: 64 }),
    limite: Type.Integer({ minimum: 1, maximum: 500, default: 100 }),
  },
  { $id: 'analises.executar-body', additionalProperties: false },
)
