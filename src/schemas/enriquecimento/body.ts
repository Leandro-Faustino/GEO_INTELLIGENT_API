import { Type } from '@sinclair/typebox'

export const EnriquecerPerfilBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    fontes: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
    tipoAlvo: Type.Optional(
      Type.Union([Type.Literal('pj'), Type.Literal('pf'), Type.Literal('territorio')]),
    ),
  },
  {
    $id: 'schema:geolead:enriquecimento:body',
    additionalProperties: false,
  },
)
