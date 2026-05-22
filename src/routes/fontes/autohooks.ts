import { type FastifyInstance } from 'fastify'

export default async function fontesHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
