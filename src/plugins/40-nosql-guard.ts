import fp from 'fastify-plugin'

function hasNoSqlOperators(value: unknown, depth = 0): boolean {
  if (depth > 20) return true
  if (value === null || typeof value !== 'object') return false

  if (Array.isArray(value)) {
    return value.some((item) => hasNoSqlOperators(item, depth + 1))
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true
    }
    if (hasNoSqlOperators((value as Record<string, unknown>)[key], depth + 1)) {
      return true
    }
  }

  return false
}

export default fp(
  async function noSqlGuardPlugin(fastify): Promise<void> {
    fastify.addHook('preValidation', async (request, reply) => {
      const suspect =
        hasNoSqlOperators(request.body) ||
        hasNoSqlOperators(request.query) ||
        hasNoSqlOperators(request.params)

      if (suspect) {
        request.log.warn(
          { url: request.url, ip: request.ip },
          'payload com operador NoSQL bloqueado',
        )
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Entrada contém operadores não permitidos.',
        })
      }
    })
  },
  { name: 'app-nosql-guard', dependencies: ['app-config'] },
)
