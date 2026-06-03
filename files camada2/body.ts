import { Type } from '@sinclair/typebox'

export const EnriquecerPerfilBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    fontes: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    ),
  },
  { $id: 'schema:geolead:enriquecimento:body', additionalProperties: false },
)
