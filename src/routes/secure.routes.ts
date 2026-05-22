import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { validateOutboundUrl } from '../security/ssrf-guard.js'
import { findDocumentById } from '../security/user-store.js'

const secureRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/documents/:id',
    {
      onRequest: fastify.authenticate,
      schema: {
        summary: 'Consultar documento protegido',
        description: 'Exemplo de controle de autorização por proprietário do recurso.',
        tags: ['Segurança'],
        security: [{ bearerAuth: [] }],
        params: Type.Object(
          { id: Type.String({ maxLength: 64 }) },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({ id: Type.String(), content: Type.String() }),
          403: Type.Object({
            statusCode: Type.Number(),
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const doc = findDocumentById(request.params.id)

      if (!doc || doc.ownerId !== request.user.sub) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Acesso negado a este recurso.',
        })
      }

      return { id: doc.id, content: doc.content }
    },
  )

  fastify.post(
    '/fetch-remote',
    {
      onRequest: fastify.authenticate,
      schema: {
        summary: 'Validar URL remota',
        description: 'Exemplo de bloqueio SSRF antes de acessar destinos externos.',
        tags: ['Segurança'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          { url: Type.String({ maxLength: 2048 }) },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({ allowed: Type.Boolean(), host: Type.String() }),
          400: Type.Object({
            statusCode: Type.Number(),
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = validateOutboundUrl(request.body.url, {
        allowedHosts: ['api.exemplo-confiavel.com'],
        allowedProtocols: ['https:'],
        allowedPorts: [443],
      })

      if (!result.ok) {
        request.log.warn(
          { url: request.body.url, reason: result.reason, ip: request.ip },
          'tentativa de SSRF bloqueada',
        )
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'URL de destino não permitida.',
        })
      }

      return { allowed: true, host: result.url!.hostname }
    },
  )
}

export default secureRoutes
