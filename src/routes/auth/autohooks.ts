import { type FastifyInstance } from 'fastify'

export default async function authHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onResponse', async (request, reply) => {
    if (request.method === 'POST' && request.routeOptions.url === '/auth/login') {
      request.log.info(
        {
          ip: request.ip,
          statusCode: reply.statusCode,
        },
        'tentativa de login',
      )
    }
  })
}
