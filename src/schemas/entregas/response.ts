import { Type } from '@sinclair/typebox'

export const EntregaResponseSchema = Type.Object(
  {
    id: Type.String(),
    analiseId: Type.String(),
    formato: Type.String(),
    status: Type.Union([Type.Literal('montada'), Type.Literal('enviada')]),
  },
  { $id: 'entregas.response' },
)
