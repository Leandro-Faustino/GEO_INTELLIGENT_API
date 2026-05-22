import fp from 'fastify-plugin'
import client from 'prom-client'

export default fp(
  async function metricsPlugin(fastify): Promise<void> {
    if (!fastify.config.METRICS_ENABLED) {
      fastify.log.info('métricas desabilitadas')
      return
    }

    const register = new client.Registry()
    register.setDefaultLabels({ service: 'geolead-api' })
    client.collectDefaultMetrics({ register })

    const requestStartedAt = new WeakMap<object, bigint>()
    const httpDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duração das requisições HTTP em segundos',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [register],
    })
    const httpTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total de requisições HTTP',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register],
    })

    fastify.addHook('onRequest', async (request) => {
      requestStartedAt.set(request, process.hrtime.bigint())
    })

    fastify.addHook('onResponse', async (request, reply) => {
      const startedAt = requestStartedAt.get(request)
      const durationSeconds = startedAt
        ? Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
        : 0
      const route = request.routeOptions.url ?? request.url
      const labels = {
        method: request.method,
        route,
        status_code: String(reply.statusCode),
      }

      httpDuration.observe(labels, durationSeconds)
      httpTotal.inc(labels)
    })

    fastify.get(
      '/metrics',
      { config: { rateLimit: false } },
      async (_request, reply) => {
        reply.header('Content-Type', register.contentType)
        return register.metrics()
      },
    )

    fastify.log.info('métricas Prometheus ativas em /metrics')
  },
  { name: 'app-metrics', dependencies: ['app-config'] },
)
