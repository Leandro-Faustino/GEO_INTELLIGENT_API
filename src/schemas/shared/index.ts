/**
 * Schemas compartilhados — reutilizáveis por todos os domínios via $ref.
 *
 * Convenção de $id:
 *   schema:<app>:<domínio>:<escopo>
 *
 * SEGURANÇA: schemas de entrada usam additionalProperties:false para
 * bloquear mass assignment (OWASP API3) junto com removeAdditional:'all'.
 */
import { Type, type TSchema } from '@sinclair/typebox'

export const IdParams = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 64 }) },
  {
    $id: 'schema:geolead:shared:id-params',
    additionalProperties: false,
  },
)

export const PaginationQuery = Type.Object(
  {
    limit: Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
    offset: Type.Integer({ minimum: 0, default: 0 }),
  },
  {
    $id: 'schema:geolead:shared:pagination',
    additionalProperties: false,
  },
)

export const ErrorResponse = Type.Object(
  {
    statusCode: Type.Integer(),
    error: Type.String(),
    message: Type.String(),
  },
  { $id: 'schema:geolead:shared:error' },
)

export function PaginatedList<T extends TSchema>(itemSchema: T, $id: string) {
  return Type.Object(
    {
      items: Type.Array(itemSchema),
      total: Type.Integer(),
      limit: Type.Integer(),
      offset: Type.Integer(),
    },
    { $id },
  )
}

export const Timestamps = {
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
}

export const sharedSchemas = [IdParams, PaginationQuery, ErrorResponse]
