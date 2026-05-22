import fp from 'fastify-plugin'

export default fp(
  async function datasourcePlugin(fastify): Promise<void> {
    const postgresUrl = fastify.config.POSTGRES_URL || fastify.config.DATABASE_URL

    if (!fastify.config.DB_ENABLED) {
      fastify.log.info('DB_ENABLED=false: usando repositórios em memória')
      return
    }

    if (postgresUrl) {
      const { default: postgres } = await import('@fastify/postgres')
      await fastify.register(postgres, {
        connectionString: postgresUrl,
        max: fastify.config.POSTGRES_POOL_MAX,
        ssl: fastify.config.POSTGRES_SSL ? { rejectUnauthorized: true } : false,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      })
      fastify.log.info(
        { poolMax: fastify.config.POSTGRES_POOL_MAX },
        'PostgreSQL conectado',
      )
    }

    if (fastify.config.MONGO_URL) {
      const { default: mongodb } = await import('@fastify/mongodb')
      await fastify.register(mongodb, {
        url: fastify.config.MONGO_URL,
        forceClose: true,
      })
      fastify.log.info('MongoDB conectado')
    }

    if (fastify.config.REDIS_URL) {
      const { default: redis } = await import('@fastify/redis')
      await fastify.register(redis, {
        url: fastify.config.REDIS_URL,
        closeClient: true,
      })
      fastify.log.info('Redis conectado')
    }
  },
  { name: 'app-datasource', dependencies: ['app-config'] },
)
