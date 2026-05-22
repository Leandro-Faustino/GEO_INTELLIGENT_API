import { type FastifyInstance } from 'fastify'

export default async function clientesHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
