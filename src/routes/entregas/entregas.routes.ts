import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import {
  EntregaResponse,
  FeedbackBody,
  FeedbackResponse,
  MontarEntregaBody,
} from '../../schemas/entregas/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'
import { assertClienteDoUsuario } from '../helpers/assert-cliente-owner.js'
import { oportunidadesParaCsv, oportunidadesParaJson } from '../../services/exportacao.service.js'

const entregasRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/entregas',
    {
      schema: {
        summary: 'Montar entrega',
        description: 'Monta uma entrega de oportunidades a partir de uma análise existente.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        body: MontarEntregaBody,
        response: { 201: EntregaResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    async function montarEntregaHandler(request, reply) {
      const cliente = await assertClienteDoUsuario(
        fastify,
        request.body.clienteId,
        request.user.sub,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          analiseId: request.body.analiseId,
          periodo: request.body.periodo,
          formato: request.body.formato,
        },
        'montagem de entrega solicitada',
      )

      const entrega = await fastify.entregaService.montarEntrega(
        cliente.id,
        request.body.analiseId,
        request.body.periodo,
        request.body.formato,
      )

      request.log.info({ entregaId: entrega.id }, 'entrega montada')
      return reply.code(201).send(entrega)
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
        response: { 200: EntregaResponse, 404: ErrorResponse, 403: ErrorResponse },
      },
    },
    async function buscarEntregaPorIdHandler(request, reply) {
      const entrega = await fastify.entregaService.buscarEntregaPorId(request.params.id)
      if (!entrega) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Entrega '${request.params.id}' não encontrada.`,
        })
      }

      await assertClienteDoUsuario(fastify, entrega.clienteId, request.user.sub)
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
        response: { 200: FeedbackResponse, 404: ErrorResponse, 403: ErrorResponse },
      },
    },
    async function registrarFeedbackEntregaHandler(request, reply) {
      const entrega = await fastify.entregaService.buscarEntregaPorId(request.params.id)
      if (!entrega) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Entrega '${request.params.id}' não encontrada.`,
        })
      }

      await assertClienteDoUsuario(fastify, entrega.clienteId, request.user.sub)

      request.log.info({ entregaId: request.params.id }, 'feedback de entrega solicitado')
      const feedbackInput = {
        ...(request.body.exclusoes ? { exclusoes: request.body.exclusoes } : {}),
        ...(request.body.ajustes ? { ajustes: request.body.ajustes } : {}),
        ...(request.body.resultados ? { resultados: request.body.resultados } : {}),
        ...(request.body.observacoes ? { observacoes: request.body.observacoes } : {}),
      }
      const feedback = await fastify.entregaService.registrarFeedback(
        request.params.id,
        feedbackInput,
      )

      if (fastify.motor && feedback.resultados.length > 0) {
        try {
          await fastify.motor.feedback(
            {
              feedbackId: feedback.id,
              clienteId: entrega.clienteId,
              resultados: feedback.resultados.map((resultado) => ({
                entidadeAlvoId: resultado.entidadeAlvoId,
                converteu: resultado.converteu,
                atributos: resultado.atributos,
                ...(resultado.ticketReal !== undefined
                  ? { ticketReal: resultado.ticketReal }
                  : {}),
              })),
            },
            request.id,
          )
        } catch (error) {
          request.log.warn(
            { err: error instanceof Error ? error.message : String(error) },
            'feedback persistido localmente, mas envio ao motor falhou',
          )
        }
      }

      request.log.info(
        { entregaId: request.params.id, feedbackId: feedback.id },
        'feedback de entrega registrado',
      )

      return reply.code(200).send({
        ...feedback,
        resultados: feedback.resultados.map((resultado) => ({
          entidadeAlvoId: resultado.entidadeAlvoId,
          converteu: resultado.converteu,
          ...(resultado.ticketReal !== undefined
            ? { ticketReal: resultado.ticketReal }
            : {}),
        })),
      })
    },
  )

  fastify.get(
    '/entregas/:id/exportar',
    {
      schema: {
        summary: 'Exportar oportunidades da entrega',
        description:
          'Gera o arquivo de oportunidades da entrega em CSV ou JSON. ' +
          'O CSV é adequado para planilhas; o JSON para integrações via API.',
        tags: ['Entregas'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        querystring: Type.Object(
          {
            formato: Type.Union(
              [Type.Literal('csv'), Type.Literal('json')],
              { default: 'json' },
            ),
          },
          { additionalProperties: false },
        ),
        response: { 200: Type.String(), 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async function exportarEntregaHandler(request, reply) {
      const entrega = await fastify.entregaService.buscarEntregaPorId(request.params.id)
      if (!entrega) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Entrega '${request.params.id}' não encontrada.`,
        })
      }

      await assertClienteDoUsuario(fastify, entrega.clienteId, request.user.sub)

      const analise = await fastify.analiseRepo.buscarPorId(entrega.analiseId)
      const oportunidades = analise?.oportunidades ?? []

      const formato = request.query.formato ?? 'json'
      const nomeArquivo = `entrega-${entrega.id}-${entrega.periodo}`

      if (formato === 'csv') {
        const csv = oportunidadesParaCsv(oportunidades)
        reply.raw.setHeader('Content-Type', 'text/csv; charset=utf-8')
        reply.raw.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}.csv"`)
        return reply.code(200).send(csv)
      }

      const json = oportunidadesParaJson(entrega, oportunidades)
      reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8')
      reply.raw.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}.json"`)
      return reply.code(200).send(JSON.stringify(json, null, 2))
    },
  )
}

export default entregasRoutes
