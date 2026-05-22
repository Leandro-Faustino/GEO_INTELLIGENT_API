import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'

const adminRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/admin/stats',
    {
      schema: {
        summary: 'Consultar estatísticas administrativas',
        description: 'Retorna contadores operacionais e uptime para usuários administradores.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            totalClientes: Type.Integer(),
            totalAnalises: Type.Integer(),
            uptime: Type.Number(),
          }),
        },
      },
    },
    async () => ({
      totalClientes: 0,
      totalAnalises: 0,
      uptime: Math.floor(process.uptime()),
    }),
  )
}

export default adminRoutes
