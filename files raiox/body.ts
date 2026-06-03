/**
 * Schema de body para o Raio-X do Cliente Ideal.
 *
 * Accelerating Fastify, Cap. 7: "we should always add all schemas
 * when declaring a route" — separados por arquivo, um body e um
 * response, registrados via addSchema() no loader.
 *
 * Reusa CompradorConhecidoSchema do contexto de clientes
 * (evita duplicação — mesmo schema que a importação de base).
 */
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
