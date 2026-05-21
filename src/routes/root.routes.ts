import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'

/**
 * Rota raiz — placeholder informativo até definirmos o domínio da API.
 *
 * Já demonstra o padrão que será usado em todas as rotas:
 *  - schema de resposta declarado (validação + serialização rápida);
 *  - type-provider TypeBox para tipagem ponta a ponta.
 */
const root: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: Type.Object({
            name: Type.String(),
            status: Type.Literal('ok'),
            environment: Type.String(),
          }),
        },
      },
    },
    async () => ({
      name: 'api-base',
      status: 'ok' as const,
      environment: fastify.config.NODE_ENV,
    }),
  )
}

export default root
