import { Type } from '@sinclair/typebox'

export const AnalisarTerritorioBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    regioes: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 20 }),
    limiar: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.3 })),
  },
  { $id: 'schema:geolead:territorio:body', additionalProperties: false },
)
