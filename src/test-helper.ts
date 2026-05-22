import Fastify from 'fastify'
import app, { buildServerOptions } from './app.js'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'silent',
  JWT_SECRET: 'test-secret-com-no-minimo-32-caracteres!!',
  JWT_EXPIRES_IN: '15m',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_WINDOW: '1 minute',
  LOGIN_RATE_LIMIT_MAX: '1000',
  CORS_ORIGIN: '',
  DATABASE_URL: '',
  REDIS_URL: '',
  SWAGGER_ENABLED: 'false',
}

export async function buildTestApp(overrides: Record<string, string> = {}) {
  Object.assign(process.env, TEST_ENV, overrides)

  const fastify = Fastify({
    ...buildServerOptions(),
    logger: false,
  })

  await fastify.register(app)
  await fastify.ready()
  return fastify
}

export async function loginAs(
  fastify: TestApp,
  email: string,
  password: string,
): Promise<string> {
  const res = await fastify.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  })
  const body = res.json<{ token: string }>()
  return body.token
}
