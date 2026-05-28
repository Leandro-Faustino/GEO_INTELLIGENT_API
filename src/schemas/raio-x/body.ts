import { Type } from '@sinclair/typebox'
import { CompradorConhecidoSchema } from '../clientes/index.js'

export const RaioXBody = Type.Object(
  {
    compradores: Type.Array(CompradorConhecidoSchema, { minItems: 1 }),
  },
  {
    $id: 'schema:geolead:raio-x:body',
    additionalProperties: false,
  },
)
