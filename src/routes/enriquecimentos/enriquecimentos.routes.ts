import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'

const enriquecimentosRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/enriquecimentos/compradores',
    {
      schema: {
        summary: 'Listar enriquecimentos de compradores',
        description: 'Lista os enriquecimentos realizados para compradores de um cliente.',
        tags: ['Enriquecimentos'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            compradorIdentificador: Type.Optional(Type.String()),
            fonte: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Array(
            Type.Object({
              id: Type.String(),
              clienteId: Type.String(),
              compradorIdentificador: Type.String(),
              compradorNome: Type.String(),
              fonte: Type.String(),
              status: Type.String(),
              payload: Type.Record(Type.String(), Type.Unknown()),
              createdAt: Type.String(),
            }),
          ),
        },
      },
    },
    async () => [],
  )
}

export default enriquecimentosRoutes
