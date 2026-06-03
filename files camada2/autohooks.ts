import { type FastifyInstance } from 'fastify'

export default async function enriquecimentoHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
