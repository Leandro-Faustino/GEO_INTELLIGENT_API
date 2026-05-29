/**
 * Rotas de Alertas de Oportunidade (C2.4).
 *
 * Detecta entidades novas que batem com o perfil ideal do cliente e
 * persiste como alerta. O franqueado vê no dashboard e age.
 *
 * Práticas aplicadas (fundamentadas na documentação):
 *  - Handler nomeado (Fastify Cap. 7: better stack traces)
 *  - Response schema tipado (Cap. 5: anti-vazamento + throughput)
 *  - Logging estruturado (Distributed Systems Cap. 4)
 *  - Idempotência: re-escanear não duplica alertas
 *  - Swagger metadata completo
 */
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import {
  ScanAlertasBody,
  ScanAlertasResponse,
  AtualizarAlertaBody,
  ListaAlertasResponse,
} from '../../schemas/alertas/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'

const alertasRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  // ── POST /alertas/escanear ────────────────────────────────
  fastify.post(
    '/alertas/escanear',
    {
      schema: {
        summary: 'Escanear novas oportunidades',
        description:
          'Verifica se há entidades novas no escopo que batem com o ' +
          'perfil ideal do cliente. Idempotente: re-executar não duplica alertas.',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        body: ScanAlertasBody,
        response: { 200: ScanAlertasResponse, 404: ErrorResponse },
      },
    },
    async function escanearAlertas(request, reply) {
      request.log.info(
        { clienteId: request.body.clienteId, escopo: request.body.escopo },
        'escaneando novas oportunidades',
      )

      const resultado = await fastify.alertaService.escanear(
        request.body.clienteId,
        request.body.escopo,
        request.body.limiar,
      )

      request.log.info(
        { gerados: resultado.alertasGerados.length, escaneadas: resultado.totalEscaneadas },
        'scan de alertas concluído',
      )

      return reply.code(200).send(resultado)
    },
  )

  // ── GET /alertas ──────────────────────────────────────────
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
            status: Type.Optional(
              Type.Union([
                Type.Literal('novo'),
                Type.Literal('visto'),
                Type.Literal('descartado'),
                Type.Literal('convertido'),
              ]),
            ),
          },
          { additionalProperties: false },
        ),
        response: { 200: ListaAlertasResponse },
      },
    },
    async function listarAlertas(request) {
      return fastify.alertaService.listar(
        request.query.clienteId,
        request.query.status,
      )
    },
  )

  // ── PATCH /alertas/:id ────────────────────────────────────
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
        response: { 200: Type.Object({
          id: Type.String(),
          status: Type.String(),
        }), 404: ErrorResponse },
      },
    },
    async function atualizarAlerta(request, reply) {
      request.log.info(
        { alertaId: request.params.id, novoStatus: request.body.status },
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
