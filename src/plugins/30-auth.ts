import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import fastifyAuth from '@fastify/auth'
import {
  type FastifyReply,
  type FastifyRequest,
  type onRequestHookHandler,
} from 'fastify'

export interface UserClaims {
  sub: string
  role: 'user' | 'admin'
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: onRequestHookHandler
    requireRole: (...roles: Array<UserClaims['role']>) => onRequestHookHandler
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UserClaims
    user: UserClaims
  }
}

export default fp(
  async function authPlugin(fastify): Promise<void> {
    if (
      fastify.config.NODE_ENV === 'production' &&
      (!fastify.config.ADMIN_EMAIL || !fastify.config.ADMIN_PASSWORD_HASH)
    ) {
      throw new Error(
        'ADMIN_EMAIL e ADMIN_PASSWORD_HASH são obrigatórios em produção.',
      )
    }

    await fastify.register(fastifyJwt, {
      secret: fastify.config.JWT_SECRET,
      sign: {
        algorithm: 'HS256',
        expiresIn: fastify.config.JWT_EXPIRES_IN,
      },
      verify: {
        algorithms: ['HS256'],
      },
    })

    await fastify.register(fastifyAuth)

    fastify.decorate(
      'authenticate',
      async function (request: FastifyRequest, reply: FastifyReply) {
        try {
          await request.jwtVerify()
        } catch {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Autenticação obrigatória ou token inválido.',
          })
        }
      },
    )

    fastify.decorate('requireRole', function (...roles) {
      return async function (request: FastifyRequest, reply: FastifyReply) {
        const user = request.user
        if (!user || !roles.includes(user.role)) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Permissão insuficiente para esta operação.',
          })
        }
      }
    })
  },
  { name: 'app-auth', dependencies: ['app-config'] },
)
