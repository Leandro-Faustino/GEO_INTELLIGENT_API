import { type FastifyPluginAsync } from 'fastify'

const routeHooks: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.addHook('onRequest', async (request) => {
    request.log = request.log.child({
      correlationId: request.id,
      boundedContext: request.routeOptions.url?.split('/')[1] ?? 'root',
    })
  })
}

export default routeHooks
