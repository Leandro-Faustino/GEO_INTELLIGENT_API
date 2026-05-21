import fp from 'fastify-plugin'
import sensible from '@fastify/sensible'
import underPressure from '@fastify/under-pressure'

/**
 * Plugin de suporte e resiliência.
 *
 *  - @fastify/sensible: adiciona `httpErrors` (ex.: fastify.httpErrors
 *    .notFound()) e utilitários, padronizando a forma como erros HTTP
 *    são lançados pela lógica de negócio nas próximas fases.
 *
 *  - @fastify/under-pressure: monitora event loop, heap e RSS. Quando
 *    a aplicação está sobrecarregada, responde 503 automaticamente em
 *    vez de degradar — uma defesa adicional contra DoS e cascata de
 *    falhas. Também expõe o endpoint de health check `/health`.
 */
export default fp(
  async function supportPlugin(fastify): Promise<void> {
    await fastify.register(sensible)

    await fastify.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 256 * 1024 * 1024,
      maxRssBytes: 512 * 1024 * 1024,
      maxEventLoopUtilization: 0.98,
      // Health check pronto para liveness/readiness probes (k8s).
      exposeStatusRoute: {
        url: '/health',
        routeOpts: {
          // Health check não deve ser limitado por rate-limit.
          config: { rateLimit: false },
        },
      },
      message: 'Serviço temporariamente indisponível — sob pressão.',
      retryAfter: 50,
    })
  },
  { name: 'app-support', dependencies: ['app-config'] },
)
