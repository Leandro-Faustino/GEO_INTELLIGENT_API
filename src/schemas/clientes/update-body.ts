import { Type } from '@sinclair/typebox'

export const ClienteUpdateBodySchema = Type.Partial(
  Type.Object({
    nome: Type.String({ minLength: 1, maxLength: 160 }),
    segmento: Type.String({ maxLength: 80 }),
  }),
  { $id: 'clientes.update-body', additionalProperties: false },
)
