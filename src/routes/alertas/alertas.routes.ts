import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import {
  AtualizarAlertaBody,
  AtualizarAlertaResponse,
  ListaAlertasResponse,
  ScanAlertasBody,
  ScanAlertasResponse,
} from '../../schemas/alertas/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'

const AlertaStatus = Type.Union([
  Type.Literal('novo'),
  Type.Literal('visto'),
  Type.Literal('descartado'),
  Type.Literal('convertido'),
])

const alertasRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/alertas/escanear',
    {
      schema: {
        summary: 'Escanear novas oportunidades',
        description:
          'Verifica se há entidades novas no escopo que batem com o perfil ideal do cliente.',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        body: ScanAlertasBody,
        response: {
          200: ScanAlertasResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async function escanearAlertasHandler(request, reply) {
      const cliente = await fastify.clienteRepo.buscarPorId(request.body.clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${request.body.clienteId}' não encontrado.`,
        })
      }
      if (cliente.ownerId !== request.user.sub) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Acesso negado a este recurso.',
        })
      }

      request.log.info(
        {
          clienteId: request.body.clienteId,
          escopo: request.body.escopo,
          limiar: request.body.limiar ?? 0.5,
        },
        'escaneando novas oportunidades',
      )

      const resultado = await fastify.alertaService.escanear(
        request.body.clienteId,
        request.body.escopo,
        request.body.limiar,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          gerados: resultado.alertasGerados.length,
          escaneadas: resultado.totalEscaneadas,
        },
        'scan de alertas concluído',
      )

      return reply.code(200).send(resultado)
    },
  )

  fastify.get(
    '/alertas',
    {
      schema: {
        summary: 'Listar alertas do cliente',
        description: 'Lista alertas de oportunidade, opcionalmente filtrados por status.',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            status: Type.Optional(AlertaStatus),
          },
          { additionalProperties: false },
        ),
        response: { 200: ListaAlertasResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async function listarAlertasHandler(request, reply) {
      const cliente = await fastify.clienteRepo.buscarPorId(request.query.clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${request.query.clienteId}' não encontrado.`,
        })
      }
      if (cliente.ownerId !== request.user.sub) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Acesso negado a este recurso.',
        })
      }

      return fastify.alertaService.listar(
        request.query.clienteId,
        request.query.status,
      )
    },
  )

  fastify.patch(
    '/alertas/:id',
    {
      schema: {
        summary: 'Atualizar status do alerta',
        description: 'Marca um alerta como visto, descartado ou convertido.',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: AtualizarAlertaBody,
        response: {
          200: AtualizarAlertaResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async function atualizarAlertaHandler(request, reply) {
      const alertaExistente = await fastify.alertaRepo.buscarPorId(request.params.id)
      if (!alertaExistente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Alerta '${request.params.id}' não encontrado.`,
        })
      }

      const cliente = await fastify.clienteRepo.buscarPorId(alertaExistente.clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${alertaExistente.clienteId}' não encontrado.`,
        })
      }
      if (cliente.ownerId !== request.user.sub) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Acesso negado a este recurso.',
        })
      }

      request.log.info(
        {
          alertaId: request.params.id,
          novoStatus: request.body.status,
        },
        'atualizando status do alerta',
      )

      const alerta = await fastify.alertaService.atualizarStatus(
        request.params.id,
        request.body.status,
      )

      return reply.code(200).send({ id: alerta.id, status: alerta.status })
    },
  )
}

export default alertasRoutes
