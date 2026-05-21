import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fp from 'fastify-plugin'
import AutoLoad from '@fastify/autoload'
import {
  type FastifyInstance,
  type FastifyServerOptions,
  type FastifyPluginAsync,
  type FastifyError,
} from 'fastify'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Plugin raiz da aplicação.
 *
 * Separar o "app" (este plugin) do "server" (runner em server.ts) é a
 * prática recomendada pelo livro: o app é facilmente injetável em testes
 * via `fastify.inject()` sem abrir portas de rede, enquanto o server.ts
 * cuida apenas de escutar e do shutdown gracioso.
 *
 * Ordem de autoload (determinística): plugins primeiro, rotas depois.
 * Inverter causaria erro, pois rotas dependem de decorators dos plugins.
 */
const appPlugin: FastifyPluginAsync = async (fastify): Promise<void> => {
  // ── Plugins (config, segurança, suporte) ────────────────────
  // Prefixo numérico nos arquivos garante ordem de carregamento.
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    encapsulate: false,
  })

  // ── Rotas ────────────────────────────────────────────────────
  // Carrega apenas arquivos *.routes.ts; demais são utilitários.
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    matchFilter: (path) => /\.routes\.(js|ts)$/.test(path),
    autoHooks: true,
    cascadeHooks: true,
  })

  // ── 404 padronizado (não revela rotas internas) ─────────────
  fastify.setNotFoundHandler(
    {
      // Aplica rate-limit também a tentativas de rota inexistente,
      // dificultando varredura/enumeração de endpoints.
      preHandler: fastify.rateLimit(),
    },
    (request, reply) => {
      reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Rota ${request.method} ${request.url} não encontrada.`,
      })
    },
  )

  // ── Tratamento de erros central ─────────────────────────────
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500

    // Erros 5xx são logados com stack; 4xx ficam em nível debug.
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'erro não tratado na requisição')
    } else {
      request.log.debug({ err: error }, 'erro de cliente')
    }

    // Erros de validação do Ajv chegam com `validation` preenchido.
    if (error.validation) {
      reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Falha na validação da entrada.',
        details: error.validation,
      })
      return
    }

    // NUNCA expor stack/detalhes internos de erros 5xx ao cliente.
    const message =
      statusCode >= 500 ? 'Erro interno do servidor.' : error.message

    reply.code(statusCode).send({
      statusCode,
      error: error.name ?? 'Error',
      message,
    })
  })
}

/**
 * Opções do servidor Fastify aplicadas tanto em produção quanto em teste.
 *
 * As proteções `onProtoPoisoning`/`onConstructorPoisoning` já vêm no modo
 * mais conservador por padrão no Fastify; mantê-las explícitas documenta
 * a intenção de segurança (prevenção de prototype poisoning / injeção).
 */
export function buildServerOptions(): FastifyServerOptions {
  return {
    // bodyLimit e logger são complementados em server.ts com a config
    // já validada; aqui ficam apenas defaults seguros e estruturais.
    ajv: {
      customOptions: {
        // Remove propriedades não declaradas no schema (anti-injeção).
        removeAdditional: 'all',
        useDefaults: true,
        coerceTypes: true,
        allErrors: false,
      },
    },
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
    // Roteamento case-sensitive: evita ambiguidade de matching de paths.
    routerOptions: {
      caseSensitive: true,
    },
    // Não confia cegamente em headers de proxy; ajuste conforme infra.
    trustProxy: false,
  }
}

/**
 * O app é exportado via `fastify-plugin` para NÃO criar um contexto
 * encapsulado próprio. Assim, decorators definidos internamente (como
 * `config`, vindo do @fastify/env) ficam acessíveis na instância raiz
 * criada em server.ts — necessário para ler HOST/PORT no listen().
 */
const app = fp(appPlugin, { name: 'app' })

export default app
export type { FastifyInstance }
