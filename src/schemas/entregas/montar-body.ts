import { Type } from '@sinclair/typebox'

export const EntregaMontarBodySchema = Type.Object(
  {
    analiseId: Type.String({ minLength: 1, maxLength: 64 }),
    formato: Type.Union([Type.Literal('json'), Type.Literal('csv')]),
  },
  { $id: 'entregas.montar-body', additionalProperties: false },
)
