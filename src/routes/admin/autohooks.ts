import { type FastifyInstance } from 'fastify'

export default async function adminHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
  fastify.addHook('onRequest', fastify.requireRole('admin'))
}
