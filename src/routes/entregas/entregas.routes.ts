import { randomUUID } from 'node:crypto'
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
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
        description: 'Cria uma entrega de oportunidades no formato solicitado.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        body: MontarEntregaBody,
        response: { 201: EntregaResponse, 404: ErrorResponse },
      },
    },
    async function montarEntrega(request, reply) {
      const { clienteId, analiseId, periodo, formato } = request.body

      const cliente = await fastify.clienteRepo.buscarPorId(clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${clienteId}' não encontrado.`,
        })
      }

      let totalOportunidades = 0
      if (analiseId) {
        const analise = await fastify.analiseRepo.buscarPorId(analiseId)
        if (!analise) {
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Análise '${analiseId}' não encontrada.`,
          })
        }
        totalOportunidades = analise.oportunidades.length
      }

      const now = new Date().toISOString()
      const entrega = await fastify.entregaRepo.salvar({
        id: randomUUID(),
        clienteId,
        analiseId: analiseId ?? null,
        tipo: formato,
        periodo,
        formato,
        totalOportunidades,
        createdAt: now,
        updatedAt: now,
      })

      return reply.code(201).send(entrega)
    },
  )

  fastify.get(
    '/entregas',
    {
      schema: {
        summary: 'Listar entregas por cliente',
        description: 'Lista entregas geradas para um cliente com paginação.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
            offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            items: Type.Array(EntregaResponse),
            total: Type.Integer(),
            limit: Type.Integer(),
            offset: Type.Integer(),
          }),
        },
      },
    },
    async function listarEntregas(request) {
      const { clienteId } = request.query
      const limit = request.query.limit ?? 20
      const offset = request.query.offset ?? 0
      const { items, total } = await fastify.entregaRepo.listarPorCliente(clienteId, limit, offset)
      return { items, total, limit, offset }
    },
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
    async function buscarEntrega(request, reply) {
      const entrega = await fastify.entregaRepo.buscarPorId(request.params.id)
      if (!entrega) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Entrega '${request.params.id}' não encontrada.`,
        })
      }
      return entrega
    },
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
        response: { 200: EntregaResponse, 404: ErrorResponse },
      },
    },
    async function registrarFeedback(request, reply) {
      const entrega = await fastify.entregaRepo.buscarPorId(request.params.id)
      if (!entrega) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Entrega '${request.params.id}' não encontrada.`,
        })
      }
      return entrega
    },
  )
}

export default entregasRoutes
