import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { findUserByCredentials } from '../../security/user-store.js'

const authRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: fastify.config.LOGIN_RATE_LIMIT_MAX,
          timeWindow: '1 minute',
        },
      },
      schema: {
        summary: 'Autenticar usuário',
        description: 'Valida credenciais e retorna um token JWT para acessar rotas protegidas.',
        tags: ['Autenticação'],
        security: [],
        body: Type.Object(
          {
            email: Type.String({ format: 'email', maxLength: 254 }),
            password: Type.String({ minLength: 1, maxLength: 128 }),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({ token: Type.String() }),
          401: Type.Object({
            statusCode: Type.Number(),
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async function loginHandler(request, reply) {
      const { email, password } = request.body
      request.log.info({ email }, 'tentativa de autenticacao recebida')
      const user = findUserByCredentials(email, password, fastify.config)

      if (!user) {
        request.log.warn({ email, ip: request.ip }, 'falha de autenticacao')
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Credenciais inválidas.',
        })
      }

      request.log.info({ userId: user.id, role: user.role }, 'autenticacao concluida')
      return {
        token: fastify.jwt.sign({ sub: user.id, role: user.role }),
      }
    },
  )

  fastify.get(
    '/auth/me',
    {
      onRequest: fastify.authenticate,
      schema: {
        summary: 'Consultar usuário autenticado',
        description: 'Retorna os claims principais do JWT enviado no header Authorization.',
        tags: ['Autenticação'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            sub: Type.String(),
            role: Type.String(),
          }),
        },
      },
    },
    async function meHandler(request) {
      return {
        sub: request.user.sub,
        role: request.user.role,
      }
    },
  )
}

export default authRoutes
