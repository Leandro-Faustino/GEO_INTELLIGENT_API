import { Type } from '@sinclair/typebox'

export const ErrorResponseSchema = Type.Object(
  {
    statusCode: Type.Number(),
    error: Type.String(),
    message: Type.String(),
  },
  { $id: 'shared.error-response' },
)
