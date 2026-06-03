import fp from 'fastify-plugin'
import { MotorClient } from '../adapters/motor.client.js'

declare module 'fastify' {
  interface FastifyInstance {
    readonly motor: MotorClient | null
  }
}

export default fp(
  async function motorPlugin(fastify): Promise<void> {
    const { MOTOR_URL, MOTOR_API_KEY, MOTOR_TIMEOUT_MS } = fastify.config

    if (!MOTOR_URL) {
      fastify.decorate('motor', null)
      fastify.log.info('motor de inteligência desabilitado')
      return
    }

    fastify.decorate(
      'motor',
      new MotorClient({
        baseUrl: MOTOR_URL,
        internalApiKey: MOTOR_API_KEY,
        timeoutMs: MOTOR_TIMEOUT_MS,
        maxRetries: 2,
        cbMaxFailures: 5,
        cbResetMs: 30_000,
      }),
    )

    fastify.log.info({ url: MOTOR_URL }, 'cliente do motor de inteligência injetado')
  },
  { name: 'app-motor', dependencies: ['app-config'] },
)
