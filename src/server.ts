import Fastify from 'fastify'
import closeWithGrace from 'close-with-grace'
import app, { buildServerOptions } from './app.js'

/**
 * Ponto de entrada da aplicação.
 *
 * Responsabilidades exclusivas deste arquivo:
 *  - construir a instância Fastify com logger e bodyLimit;
 *  - registrar o plugin raiz (app);
 *  - escutar na porta configurada;
 *  - encerrar graciosamente em SIGINT/SIGTERM.
 *
 * Toda a lógica da aplicação vive em app.ts e nos plugins, mantendo este
 * runner fino e substituível (ex.: por fastify-cli ou ambiente serverless).
 */
async function main(): Promise<void> {
  // O logger precisa existir antes de termos a config validada, então
  // lemos NODE_ENV/LOG_LEVEL diretamente do ambiente apenas para o
  // bootstrap do logger. A config completa é validada pelo plugin de env.
  const isDev = process.env['NODE_ENV'] !== 'production'
  const logLevel = process.env['LOG_LEVEL'] ?? 'info'
  const bodyLimit = Number(process.env['BODY_LIMIT'] ?? 1_048_576)

  const fastify = Fastify({
    ...buildServerOptions(),
    bodyLimit,
    // Pino estruturado. Em dev usa pino-pretty para leitura humana;
    // em produção emite JSON puro (consumível por log management).
    logger: {
      level: logLevel,
      ...(isDev
        ? { transport: { target: 'pino-pretty' } }
        : {}),
      // Não logar headers sensíveis (Authorization, cookies).
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
    },
    // requestId em todo log de requisição — base para correlação/tracing.
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
  })

  await fastify.register(app)

  // ── Graceful shutdown ────────────────────────────────────────
  // Encapsula o padrão do livro: ao receber SIGINT/SIGTERM, para de
  // aceitar novas conexões, conclui as em andamento e dispara os hooks
  // onClose (ex.: fechar conexões de banco). Após o timeout, força saída.
  // Registrado ANTES de listen(), pois hooks não podem ser adicionados
  // depois que a instância começa a escutar.
  const closeListeners = closeWithGrace(
    { delay: 10_000 },
    async ({ err, signal }) => {
      if (err) {
        fastify.log.error({ err }, 'erro durante o encerramento')
      } else {
        fastify.log.info({ signal }, 'encerrando graciosamente')
      }
      await fastify.close()
    },
  )

  fastify.addHook('onClose', async () => {
    closeListeners.uninstall()
  })

  try {
    // listen() internamente aguarda ready(): se algum plugin falhar no
    // boot, o erro é capturado aqui e o processo encerra com código 1.
    await fastify.listen({
      host: fastify.config.HOST,
      port: fastify.config.PORT,
    })
  } catch (err) {
    fastify.log.error({ err }, 'falha ao iniciar o servidor')
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  // Falha catastrófica antes do logger estar disponível.
  // eslint-disable-next-line no-console
  console.error('Falha fatal no bootstrap:', err)
  process.exit(1)
})
