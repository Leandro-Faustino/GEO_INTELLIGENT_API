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
    DB_ENABLED: {
      type: 'boolean',
      default: false,
    },
    DATABASE_URL: {
      type: 'string',
      default: '',
    },
    POSTGRES_URL: {
      type: 'string',
      default: '',
    },
    POSTGRES_POOL_MAX: {
      type: 'integer',
      default: 10,
    },
    POSTGRES_SSL: {
      type: 'boolean',
      default: false,
    },
    MONGO_URL: {
      type: 'string',
      default: '',
    },
    REDIS_URL: {
      type: 'string',
      default: '',
    },
    CACHE_TTL_SECONDS: {
      type: 'integer',
      default: 3600,
    },
    METRICS_ENABLED: {
      type: 'boolean',
      default: true,
    },
    TRACING_ENABLED: {
      type: 'boolean',
      default: false,
    },
    OTEL_EXPORTER_OTLP_ENDPOINT: {
      type: 'string',
      default: 'http://localhost:4318/v1/traces',
    },
    SWAGGER_ENABLED: {
      type: 'boolean',
      default: true,
    },
    ENVIRONMENT: {
      type: 'string',
      default: 'development',
    },
    ENGINE_HOST_PORT: {
      type: 'integer',
      default: 8000,
    },
    INTERNAL_API_KEY: {
      type: 'string',
      default: 'troque-em-producao-min-32-caracteres!!',
    },
    MODEL_VERSION: {
      type: 'string',
      default: '0.1.0',
    },
    MOTOR_URL: {
      type: 'string',
      default: '',
    },
    MOTOR_API_KEY: {
      type: 'string',
      default: 'troque-em-producao-min-32-caracteres!!',
    },
    MOTOR_TIMEOUT_MS: {
      type: 'integer',
      default: 10_000,
    },
    EMBEDDINGS_ENABLED: {
      type: 'boolean',
      default: false,
    },
    EMBEDDINGS_PROVIDER: {
      type: 'string',
      enum: ['api', 'sbert'],
      default: 'api',
    },
    EMBEDDINGS_MODEL: {
      type: 'string',
      default: 'text-embedding-3-small',
    },
    HOOKS_LLM_ENABLED: {
      type: 'boolean',
      default: false,
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
  DB_ENABLED: boolean
  DATABASE_URL: string
  POSTGRES_URL: string
  POSTGRES_POOL_MAX: number
  POSTGRES_SSL: boolean
  MONGO_URL: string
  REDIS_URL: string
  CACHE_TTL_SECONDS: number
  METRICS_ENABLED: boolean
  TRACING_ENABLED: boolean
  OTEL_EXPORTER_OTLP_ENDPOINT: string
  SWAGGER_ENABLED: boolean
  ENVIRONMENT: string
  ENGINE_HOST_PORT: number
  INTERNAL_API_KEY: string
  MODEL_VERSION: string
  MOTOR_URL: string
  MOTOR_API_KEY: string
  MOTOR_TIMEOUT_MS: number
  EMBEDDINGS_ENABLED: boolean
  EMBEDDINGS_PROVIDER: 'api' | 'sbert'
  EMBEDDINGS_MODEL: string
  HOOKS_LLM_ENABLED: boolean
}
