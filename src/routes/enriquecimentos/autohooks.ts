import { type FastifyInstance } from 'fastify'

export default async function enriquecimentosHooks(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
