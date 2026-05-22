import { type FastifyInstance } from 'fastify'

export default async function analisesHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
