import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'

/**
 * Plugin de segurança — defesa em profundidade.
 *
 * Reúne três camadas recomendadas pela base de conhecimento:
 *
 *  1. @fastify/helmet  — injeta headers de segurança (CSP, HSTS,
 *     X-Content-Type-Options, Referrer-Policy, etc.) e remove o
 *     X-Powered-By, dificultando o fingerprinting do servidor.
 *
 *  2. @fastify/cors    — configurado de forma RESTRITIVA por padrão.
 *     O livro do Fastify mostra `origin: true` (libera tudo) apenas
 *     como exemplo e alerta para ajustá-lo. Aqui as origens vêm de
 *     CORS_ORIGIN; lista vazia bloqueia qualquer browser cross-origin.
 *
 *  3. @fastify/rate-limit — mitiga DoS e brute-force limitando o
 *     número de requisições por IP por janela de tempo.
 *
 * Registrado com fastify-plugin para aplicar a todas as rotas do
 * contexto raiz.
 */
export default fp(
  async function securityPlugin(fastify): Promise<void> {
    const { CORS_ORIGIN, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW, NODE_ENV } =
      fastify.config

    // ── Headers de segurança ────────────────────────────────────
    await fastify.register(helmet, {
      // CSP estrita: desabilitada para APIs JSON puras evita quebrar
      // clientes não-browser; reative e ajuste se servir HTML.
      contentSecurityPolicy: NODE_ENV === 'production',
      // HSTS só faz sentido sob HTTPS (terminação TLS em produção).
      hsts: NODE_ENV === 'production',
    })

    // ── CORS restritivo ─────────────────────────────────────────
    const allowedOrigins = CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0)

    await fastify.register(cors, {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true,
    })

    // ── Rate limiting ───────────────────────────────────────────
    await fastify.register(rateLimit, {
      max: RATE_LIMIT_MAX,
      timeWindow: RATE_LIMIT_WINDOW,
      // Resposta padronizada ao exceder o limite.
      errorResponseBuilder: (_req, context) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Limite de requisições excedido. Tente novamente em ${context.after}.`,
      }),
    })

    fastify.log.info(
      {
        cors: allowedOrigins.length > 0 ? allowedOrigins : 'bloqueado',
        rateLimit: `${RATE_LIMIT_MAX}/${RATE_LIMIT_WINDOW}`,
      },
      'camadas de segurança ativadas',
    )
  },
  { name: 'app-security', dependencies: ['app-config'] },
)
