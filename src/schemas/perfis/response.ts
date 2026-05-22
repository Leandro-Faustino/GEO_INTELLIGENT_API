import { Type } from '@sinclair/typebox'

export const PerfilResponseSchema = Type.Object(
  {
    id: Type.String(),
    clienteId: Type.String(),
    criterios: Type.Array(Type.String()),
  },
  { $id: 'perfis.response' },
)
