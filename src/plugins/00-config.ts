import fp from 'fastify-plugin'
import fastifyEnv from '@fastify/env'
import { envSchema } from '../configs/env.schema.js'

/**
 * Plugin de configuração.
 *
 * Carrega as variáveis de ambiente, valida-as contra o `envSchema` e
 * expõe o resultado em `fastify.config`. É registrado com `fastify-plugin`
 * para que o decorator `config` esteja disponível no contexto raiz e em
 * todos os plugins/rotas filhos.
 *
 * O `await` no register é deliberado: garante que `fastify.config` já
 * exista quando os plugins seguintes (cors, rate-limit, etc.) forem
 * carregados e precisarem ler a configuração.
 */
export default fp(
  async function configPlugin(fastify): Promise<void> {
    await fastify.register(fastifyEnv, {
      confKey: 'config',
      schema: envSchema,
      dotenv: true,
    })

    fastify.log.info(
      { env: fastify.config.NODE_ENV, port: fastify.config.PORT },
      'configuração carregada e validada',
    )
  },
  { name: 'app-config' },
)
