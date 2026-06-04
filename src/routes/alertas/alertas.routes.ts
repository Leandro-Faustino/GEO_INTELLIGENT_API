import { randomUUID } from 'node:crypto'
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'

type AlertaStatus = 'novo' | 'visto' | 'descartado' | 'convertido'

interface Alerta {
  id: string
  clienteId: string
  tipo: string
  entidadeAlvoId: string
  entidadeNome: string
  entidadeCidade: string
  score: number
  mensagem: string
  status: AlertaStatus
  criadoEm: string
}

const alertasStore = new Map<string, Alerta>()

const AlertaSchema = Type.Object({
  id: Type.String(),
  clienteId: Type.String(),
  tipo: Type.String(),
  entidadeAlvoId: Type.String(),
  entidadeNome: Type.String(),
  entidadeCidade: Type.String(),
  score: Type.Number(),
  mensagem: Type.String(),
  status: Type.String(),
  criadoEm: Type.String(),
})

const alertasRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/alertas/escanear',
    {
      schema: {
        summary: 'Escanear alertas',
        description: 'Varre entidades do escopo e gera alertas para oportunidades acima do limiar.',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            escopo: Type.String({ minLength: 1 }),
            limiar: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.7 })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            alertasGerados: Type.Array(AlertaSchema),
            totalEscaneadas: Type.Integer(),
          }),
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { clienteId, escopo, limiar = 0.7 } = request.body

      const cliente = await fastify.clienteRepo.buscarPorId(clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${clienteId}' não encontrado.`,
        })
      }

      const entidades = await fastify.entidadeAlvoRepo.buscarPorEscopo(escopo)
      const alertasGerados: Alerta[] = []

      for (const entidade of entidades) {
        const scoreSimulado = Math.random()
        if (scoreSimulado >= limiar) {
          const alerta: Alerta = {
            id: randomUUID(),
            clienteId,
            tipo: 'oportunidade',
            entidadeAlvoId: entidade.identificador,
            entidadeNome: entidade.nome,
            entidadeCidade: entidade.atributos['cidade']
              ? String(entidade.atributos['cidade'])
              : 'N/A',
            score: Math.round(scoreSimulado * 100) / 100,
            mensagem: `${entidade.nome} possui perfil compatível com score ${(scoreSimulado * 100).toFixed(0)}%.`,
            status: 'novo',
            criadoEm: new Date().toISOString(),
          }
          alertasStore.set(alerta.id, alerta)
          alertasGerados.push(alerta)
        }
      }

      return { alertasGerados, totalEscaneadas: entidades.length }
    },
  )

  fastify.get(
    '/alertas',
    {
      schema: {
        summary: 'Listar alertas',
        description: 'Lista alertas gerados para um cliente.',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            status: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Array(AlertaSchema),
        },
      },
    },
    async (request) => {
      const { clienteId, status } = request.query
      let alertas = [...alertasStore.values()].filter((a) => a.clienteId === clienteId)
      if (status) {
        alertas = alertas.filter((a) => a.status === status)
      }
      return alertas.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    },
  )

  fastify.patch(
    '/alertas/:id',
    {
      schema: {
        summary: 'Atualizar status de alerta',
        description: 'Atualiza o status de um alerta (visto, descartado, convertido).',
        tags: ['Alertas'],
        security: [{ bearerAuth: [] }],
        params: Type.Object(
          { id: Type.String() },
          { additionalProperties: false },
        ),
        body: Type.Object(
          { status: Type.String({ enum: ['novo', 'visto', 'descartado', 'convertido'] }) },
          { additionalProperties: false },
        ),
        response: {
          200: AlertaSchema,
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const alerta = alertasStore.get(request.params.id)
      if (!alerta) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Alerta '${request.params.id}' não encontrado.`,
        })
      }
      alerta.status = request.body.status as AlertaStatus
      return alerta
    },
  )
}

export default alertasRoutes
