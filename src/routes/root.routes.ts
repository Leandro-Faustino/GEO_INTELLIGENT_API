import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'

type HealthChecks = {
  postgres: 'ok' | 'down' | 'disabled' | 'not-configured'
  mongodb: 'ok' | 'down' | 'disabled' | 'not-configured'
  redis: 'ok' | 'degraded' | 'disabled' | 'not-configured'
}

/**
 * Rota raiz — placeholder informativo até definirmos o domínio da API.
 *
 * Já demonstra o padrão que será usado em todas as rotas:
 *  - schema de resposta declarado (validação + serialização rápida);
 *  - type-provider TypeBox para tipagem ponta a ponta.
 */
const root: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/',
    {
      schema: {
        summary: 'Status da API',
        description: 'Retorna informações básicas para verificar se a API está ativa.',
        tags: ['Status'],
        security: [],
        response: {
          200: Type.Object({
            name: Type.String(),
            status: Type.Literal('ok'),
            environment: Type.String(),
          }),
        },
      },
    },
    async function statusHandler() {
      return {
        name: 'api-base',
        status: 'ok' as const,
        environment: fastify.config.NODE_ENV,
      }
    },
  )

  fastify.get(
    '/health',
    {
      config: {
        rateLimit: false,
      },
      schema: {
        summary: 'Health check detalhado',
        description:
          'Verifica a saúde da API e das dependências configuradas para uso em readiness checks.',
        tags: ['Status'],
        security: [],
        response: {
          200: Type.Object({
            status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
            checks: healthChecksSchema(),
          }),
          503: Type.Object({
            status: Type.Literal('unhealthy'),
            checks: healthChecksSchema(),
          }),
        },
      },
    },
    async function healthCheckHandler(_request, reply) {
      const checks = await verificarDependencias(fastify)
      const status = calcularStatus(checks)
      return reply.code(status === 'unhealthy' ? 503 : 200).send({ status, checks })
    },
  )
}

export default root

function healthChecksSchema() {
  return Type.Object({
    postgres: Type.Union([
      Type.Literal('ok'),
      Type.Literal('down'),
      Type.Literal('disabled'),
      Type.Literal('not-configured'),
    ]),
    mongodb: Type.Union([
      Type.Literal('ok'),
      Type.Literal('down'),
      Type.Literal('disabled'),
      Type.Literal('not-configured'),
    ]),
    redis: Type.Union([
      Type.Literal('ok'),
      Type.Literal('degraded'),
      Type.Literal('disabled'),
      Type.Literal('not-configured'),
    ]),
  })
}

async function verificarDependencias(
  fastify: Parameters<FastifyPluginAsyncTypebox>[0],
): Promise<HealthChecks> {
  const checks: HealthChecks = {
    postgres: fastify.config.DB_ENABLED ? 'not-configured' : 'disabled',
    mongodb: fastify.config.DB_ENABLED ? 'not-configured' : 'disabled',
    redis: fastify.config.REDIS_URL ? 'degraded' : 'not-configured',
  }

  const comPg = fastify as typeof fastify & {
    pg?: { query: (sql: string) => Promise<unknown> }
  }
  const comMongo = fastify as typeof fastify & {
    mongo?: {
      client?: {
        db: (name?: string) => {
          command: (cmd: object) => Promise<unknown>
        }
      }
    }
  }
  const comRedis = fastify as typeof fastify & {
    redis?: { ping: () => Promise<string> }
  }

  if (fastify.config.DB_ENABLED) {
    if (fastify.config.POSTGRES_URL || fastify.config.DATABASE_URL) {
      checks.postgres = await verificarPostgres(comPg.pg)
    }
    if (fastify.config.MONGO_URL) {
      checks.mongodb = await verificarMongo(comMongo.mongo)
    }
  }

  if (fastify.config.REDIS_URL) {
    checks.redis = await verificarRedis(comRedis.redis)
  }

  return checks
}

async function verificarPostgres(
  pg?: { query: (sql: string) => Promise<unknown> },
): Promise<HealthChecks['postgres']> {
  if (!pg) {
    return 'down'
  }

  try {
    await pg.query('SELECT 1')
    return 'ok'
  } catch {
    return 'down'
  }
}

async function verificarMongo(
  mongo?: {
    client?: {
      db: (name?: string) => {
        command: (cmd: object) => Promise<unknown>
      }
    }
  },
): Promise<HealthChecks['mongodb']> {
  const db = mongo?.client?.db()
  if (!db) {
    return 'down'
  }

  try {
    await db.command({ ping: 1 })
    return 'ok'
  } catch {
    return 'down'
  }
}

async function verificarRedis(
  redis?: { ping: () => Promise<string> },
): Promise<HealthChecks['redis']> {
  if (!redis) {
    return 'degraded'
  }

  try {
    await redis.ping()
    return 'ok'
  } catch {
    return 'degraded'
  }
}

function calcularStatus(checks: HealthChecks): 'ok' | 'degraded' | 'unhealthy' {
  if (checks.postgres === 'down' || checks.mongodb === 'down') {
    return 'unhealthy'
  }

  if (checks.redis === 'degraded') {
    return 'degraded'
  }

  return 'ok'
}
