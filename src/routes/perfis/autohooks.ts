import { type FastifyInstance } from 'fastify'

export default async function perfisHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
