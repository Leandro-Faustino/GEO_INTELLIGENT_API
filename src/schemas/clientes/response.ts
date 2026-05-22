import { Type } from '@sinclair/typebox'

export const ClienteResponseSchema = Type.Object(
  {
    id: Type.String(),
    nome: Type.String(),
    documento: Type.String(),
    segmento: Type.Optional(Type.String()),
  },
  { $id: 'clientes.response' },
)
