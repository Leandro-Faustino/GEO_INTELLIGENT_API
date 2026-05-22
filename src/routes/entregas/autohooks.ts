import { type FastifyInstance } from 'fastify'

export default async function entregasHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
