/**
 * Schema de validação das variáveis de ambiente.
 *
 * O @fastify/env compila este schema com Ajv e LANÇA ERRO no boot
 * se uma variável obrigatória estiver ausente ou com tipo inválido.
 * Isso garante que a aplicação nunca suba em estado inconsistente
 * — princípio "fail fast" recomendado no scaffolding do Fastify.
 *
 * O resultado validado é exposto em `fastify.config`.
 */
export const envSchema = {
  type: 'object',
  required: ['NODE_ENV', 'PORT', 'HOST', 'JWT_SECRET'],
  additionalProperties: false,
  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'test', 'production'],
      default: 'development',
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    PORT: {
      type: 'integer',
      default: 3000,
    },
    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },
    BODY_LIMIT: {
      type: 'integer',
      // 1 MiB. Limita o tamanho do payload para mitigar DoS por corpo grande.
      default: 1_048_576,
    },
    CORS_ORIGIN: {
      // Lista separada por vírgula. String vazia = nenhuma origem de browser.
      type: 'string',
      default: '',
    },
    RATE_LIMIT_MAX: {
      type: 'integer',
      default: 100,
    },
    RATE_LIMIT_WINDOW: {
      type: 'string',
      default: '1 minute',
    },
    LOGIN_RATE_LIMIT_MAX: {
      type: 'integer',
      default: 5,
    },
    JWT_SECRET: {
      type: 'string',
      minLength: 32,
    },
    JWT_EXPIRES_IN: {
      type: 'string',
      default: '15m',
    },
  },
} as const

/**
 * Tipo derivado do schema, consumido pelo type-provider para tipar
 * `fastify.config` de ponta a ponta (validação em compile-time + runtime).
 */
export interface AppConfig {
  NODE_ENV: 'development' | 'test' | 'production'
  HOST: string
  PORT: number
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  BODY_LIMIT: number
  CORS_ORIGIN: string
  RATE_LIMIT_MAX: number
  RATE_LIMIT_WINDOW: string
  LOGIN_RATE_LIMIT_MAX: number
  JWT_SECRET: string
  JWT_EXPIRES_IN: string
}
