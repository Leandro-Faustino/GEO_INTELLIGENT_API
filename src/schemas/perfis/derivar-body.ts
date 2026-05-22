import { Type } from '@sinclair/typebox'

export const PerfilDerivarBodySchema = Type.Object(
  {
    clienteId: Type.String({ minLength: 1, maxLength: 64 }),
    janelaMeses: Type.Integer({ minimum: 1, maximum: 60, default: 12 }),
  },
  { $id: 'perfis.derivar-body', additionalProperties: false },
)
