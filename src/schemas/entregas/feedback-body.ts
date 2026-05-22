import { Type } from '@sinclair/typebox'

export const FeedbackBodySchema = Type.Object(
  {
    entregaId: Type.String({ minLength: 1, maxLength: 64 }),
    qualidade: Type.Integer({ minimum: 1, maximum: 5 }),
    comentario: Type.Optional(Type.String({ maxLength: 1000 })),
  },
  { $id: 'entregas.feedback-body', additionalProperties: false },
)
