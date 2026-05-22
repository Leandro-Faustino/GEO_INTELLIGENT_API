import { Type } from '@sinclair/typebox'

export const PaginationQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  },
  { $id: 'shared.pagination-query', additionalProperties: false },
)
