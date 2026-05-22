import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  EntregaResponse,
  FeedbackBody,
  MontarEntregaBody,
} from '../../schemas/entregas/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'

const entregasRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/entregas',
    {
      schema: {
        summary: 'Montar entrega',
        description: 'Monta uma entrega de oportunidades no formato solicitado.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        body: MontarEntregaBody,
        response: { 201: EntregaResponse, 422: ErrorResponse },
      },
    },
    async (_request, reply) =>
      reply.code(422).send({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Serviço de entrega ainda não implementado.',
      }),
  )

  fastify.get(
    '/entregas/:id',
    {
      schema: {
        summary: 'Buscar entrega por ID',
        description: 'Consulta os metadados de uma entrega gerada.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: { 200: EntregaResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) =>
      reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Entrega '${request.params.id}' não encontrada.`,
      }),
  )

  fastify.post(
    '/entregas/:id/feedback',
    {
      schema: {
        summary: 'Registrar feedback da entrega',
        description: 'Registra ajustes e resultados observados após uma entrega.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: FeedbackBody,
        response: { 200: EntregaResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    async (_request, reply) =>
      reply.code(422).send({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Serviço de feedback ainda não implementado.',
      }),
  )
}

export default entregasRoutes
