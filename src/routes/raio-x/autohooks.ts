import { type FastifyInstance } from 'fastify'

export default async function raioXHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
