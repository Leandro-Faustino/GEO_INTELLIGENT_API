import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { AnaliseResponse, ExecutarLookalikeBody } from '../../schemas/analises/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'

const analisesRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/analises/executar',
    {
      schema: {
        summary: 'Executar análise lookalike',
        description: 'Executa uma análise para encontrar oportunidades similares ao perfil alvo.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        body: ExecutarLookalikeBody,
        response: { 201: AnaliseResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    async function executarAnalise(request, reply) {
      const analise = await fastify.analiseService.executarLookalike(
        request.body.clienteId,
        request.body.escopo,
        request.body.limiarSimilaridade,
      )

      return reply.code(201).send({
        ...analise,
        totalOportunidades: analise.oportunidades.length,
      })
    },
  )

  fastify.get(
    '/analises',
    {
      schema: {
        summary: 'Listar análises por cliente',
        description: 'Lista análises executadas para um cliente com paginação.',
        tags: ['Análises'],
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
            items: Type.Array(AnaliseResponse),
            total: Type.Integer(),
            limit: Type.Integer(),
            offset: Type.Integer(),
          }),
        },
      },
    },
    async function listarAnalises(request) {
      const clienteId = request.query.clienteId
      const limit = request.query.limit ?? 20
      const offset = request.query.offset ?? 0
      const { items, total } = await fastify.analiseRepo.listarPorCliente(clienteId, limit, offset)
      return {
        items: items.map((a) => ({ ...a, totalOportunidades: a.oportunidades.length })),
        total,
        limit,
        offset,
      }
    },
  )

  fastify.get(
    '/analises/:id',
    {
      schema: {
        summary: 'Buscar análise por ID',
        description: 'Consulta o resultado de uma análise executada.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: { 200: AnaliseResponse, 404: ErrorResponse },
      },
    },
    async function buscarAnalise(request, reply) {
      const analise = await fastify.analiseRepo.buscarPorId(request.params.id)
      if (!analise) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Análise '${request.params.id}' não encontrada.`,
        })
      }

      return { ...analise, totalOportunidades: analise.oportunidades.length }
    },
  )

  fastify.get(
    '/analises/:id/mapa',
    {
      schema: {
        summary: 'Dados de mapa para análise',
        description: 'Retorna entidades com coordenadas, scores e status jaCliente para renderizar o mapa.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: Type.Object({
            analiseId: Type.String(),
            centroMapa: Type.Union([
              Type.Object({ lat: Type.Number(), lon: Type.Number(), zoom: Type.Integer() }),
              Type.Null(),
            ]),
            totalEntidades: Type.Integer(),
            entidades: Type.Array(
              Type.Object({
                identificador: Type.String(),
                nome: Type.String(),
                endereco: Type.String(),
                lat: Type.Union([Type.Number(), Type.Null()]),
                lon: Type.Union([Type.Number(), Type.Null()]),
                score: Type.Union([Type.Number(), Type.Null()]),
                faixaScore: Type.Union([Type.String(), Type.Null()]),
                jaCliente: Type.Boolean(),
              }),
            ),
          }),
          404: ErrorResponse,
        },
      },
    },
    async function buscarMapaAnalise(request, reply) {
      const analise = await fastify.analiseRepo.buscarPorId(request.params.id)
      if (!analise) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Análise '${request.params.id}' não encontrada.`,
        })
      }

      const [entidades, base] = await Promise.all([
        fastify.entidadeAlvoRepo.buscarPorEscopo(analise.escopo),
        fastify.baseInternaRepo.buscarPorCliente(analise.clienteId),
      ])

      const jaClienteIds = new Set(base?.compradores.map((c) => c.identificador) ?? [])
      const scoreMap = new Map(analise.oportunidades.map((o) => [o.entidadeAlvoId, o]))

      const entidadesMapa = entidades.map((e) => {
        const op = scoreMap.get(e.identificador)
        const lat = e.latitude !== 0 ? e.latitude : null
        const lon = e.longitude !== 0 ? e.longitude : null
        return {
          identificador: e.identificador,
          nome: e.nome,
          endereco: e.endereco,
          lat,
          lon,
          score: op ? op.score.valor : null,
          faixaScore: op ? op.prioridade : null,
          jaCliente: jaClienteIds.has(e.identificador),
        }
      })

      const comCoords = entidadesMapa.filter((e) => e.lat != null && e.lon != null)
      const centroMapa = comCoords.length > 0
        ? {
            lat: Number((comCoords.reduce((s, e) => s + e.lat!, 0) / comCoords.length).toFixed(4)),
            lon: Number((comCoords.reduce((s, e) => s + e.lon!, 0) / comCoords.length).toFixed(4)),
            zoom: 13,
          }
        : null

      return {
        analiseId: analise.id,
        centroMapa,
        totalEntidades: entidades.length,
        entidades: entidadesMapa,
      }
    },
  )
}

export default analisesRoutes
