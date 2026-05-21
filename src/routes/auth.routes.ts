import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { findUserByCredentials } from '../security/user-store.js'

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
    async (request, reply) => {
      const { email, password } = request.body
      const user = findUserByCredentials(email, password)

      if (!user) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Credenciais inválidas.',
        })
      }

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
        response: {
          200: Type.Object({
            sub: Type.String(),
            role: Type.String(),
          }),
        },
      },
    },
    async (request) => ({
      sub: request.user.sub,
      role: request.user.role,
    }),
  )
}

export default authRoutes
