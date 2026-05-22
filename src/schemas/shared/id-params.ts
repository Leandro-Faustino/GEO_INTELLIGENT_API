import { Type } from '@sinclair/typebox'

export const IdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { $id: 'shared.id-params', additionalProperties: false },
)
