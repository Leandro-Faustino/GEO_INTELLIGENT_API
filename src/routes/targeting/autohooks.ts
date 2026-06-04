import { type FastifyInstance } from 'fastify'

export default async function targetingHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
