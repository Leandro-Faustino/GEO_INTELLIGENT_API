import { Type } from '@sinclair/typebox'

export const ClienteCreateBodySchema = Type.Object(
  {
    nome: Type.String({ minLength: 1, maxLength: 160 }),
    documento: Type.String({ minLength: 11, maxLength: 18 }),
    segmento: Type.Optional(Type.String({ maxLength: 80 })),
  },
  { $id: 'clientes.create-body', additionalProperties: false },
)
