/**
 * Autohook do Raio-X — aplica autenticação.
 *
 * Accelerating Fastify, Cap. 6: "The autoHooks flag lets you register
 * some hooks for every routes.js file. The cascadeHooks option also
 * turns this feature on for the subdirectories."
 *
 * Segue o padrão do repo: cada bounded context tem um autohooks.ts
 * que registra o onRequest hook de autenticação.
 */
import { type FastifyInstance } from 'fastify'

export default async function raioXHooks(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate)
}
