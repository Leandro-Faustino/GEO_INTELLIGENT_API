import { Type } from '@sinclair/typebox'

export const AnalisarCompetitivaBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    regiao: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { $id: 'schema:geolead:competitiva:body', additionalProperties: false },
)
