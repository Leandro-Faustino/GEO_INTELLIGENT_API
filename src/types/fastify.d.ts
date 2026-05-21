import { type AppConfig } from '../configs/env.schema.js'

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Configuração validada da aplicação, populada pelo plugin de env.
     * Exposta como decorator para acesso tipado em qualquer plugin/rota.
     */
    readonly config: AppConfig
  }
}

export {}
