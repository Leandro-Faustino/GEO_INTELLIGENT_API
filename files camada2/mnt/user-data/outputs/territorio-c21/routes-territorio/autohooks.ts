import { type FastifyInstance } from 'fastify'

export default async function territorioHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
