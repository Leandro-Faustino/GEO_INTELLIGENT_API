import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
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
    async (request, reply) => {
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
    async (request, reply) => {
      const analise = await fastify.analiseRepo.buscarPorId(request.params.id)
      if (!analise) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Análise '${request.params.id}' não encontrada.`,
        })
      }

      return {
        ...analise,
        totalOportunidades: analise.oportunidades.length,
      }
    },
  )
}

export default analisesRoutes
