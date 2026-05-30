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
 *    falhas. O readiness check HTTP fica em `src/routes/root.routes.ts`
 *    para permitir verificações detalhadas de dependências externas.
 */
export default fp(
  async function supportPlugin(fastify): Promise<void> {
    await fastify.register(sensible)

    if (!fastify.config.UNDER_PRESSURE_ENABLED) {
      fastify.log.info('under-pressure desabilitado para este ambiente')
      return
    }

    await fastify.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 256 * 1024 * 1024,
      maxRssBytes: 512 * 1024 * 1024,
      maxEventLoopUtilization: 0.98,
      message: 'Serviço temporariamente indisponível — sob pressão.',
      retryAfter: 50,
    })
  },
  { name: 'app-support', dependencies: ['app-config'] },
)
