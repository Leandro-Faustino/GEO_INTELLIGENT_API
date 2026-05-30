import fp from 'fastify-plugin'
import {
  MemoryCacheService,
  RedisCacheService,
  type CacheService,
} from '../services/cache.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    readonly cache: CacheService
  }
}

export default fp(
  async function cachePlugin(fastify): Promise<void> {
    const redis = (
      fastify as unknown as {
        redis?: ConstructorParameters<typeof RedisCacheService>[0]
      }
    ).redis

    const cache = redis
      ? new RedisCacheService(redis, fastify.config.CACHE_TTL_SECONDS)
      : new MemoryCacheService(fastify.config.CACHE_TTL_SECONDS)

    fastify.decorate<CacheService>('cache', cache)
    fastify.log.info(
      { backend: redis ? 'redis' : 'memory' },
      'cache-aside configurado',
    )
  },
  { name: 'app-cache', dependencies: ['app-config', 'app-datasource'] },
)
