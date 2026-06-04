import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { TargetingQuery } from '../../schemas/targeting/index.js'
import { TargetingResultSchema } from '../../schemas/targeting/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'

const targetingRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/analises/:id/targeting',
    {
      schema: {
        summary: 'Gerar zonas de targeting',
        description:
          'Cruza o resultado de uma análise com dados demográficos e retorna zonas geográficas ' +
          'prontas para segmentação no Facebook/Instagram Ads Manager.',
        tags: ['Targeting'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        querystring: TargetingQuery,
        response: { 200: TargetingResultSchema, 404: ErrorResponse },
      },
    },
    async function gerarTargeting(request, reply) {
      request.log.info(
        { analiseId: request.params.id, ...request.query },
        'gerando zonas de targeting',
      )

      const result = await fastify.targetingService.gerarZonasTargeting(
        request.params.id,
        request.query.raioKm,
        request.query.limiarScore,
      )

      request.log.info(
        { analiseId: request.params.id, totalZonas: result.totalZonas },
        'zonas de targeting geradas',
      )

      return reply.send(result)
    },
  )

  fastify.get(
    '/analises/:id/targeting/exportar',
    {
      schema: {
        summary: 'Exportar targeting em CSV',
        description:
          'Gera um CSV com as zonas de targeting prontas para o gestor de tráfego configurar campanhas.',
        tags: ['Targeting'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        querystring: TargetingQuery,
      },
    },
    async function exportarTargetingCSV(request, reply) {
      request.log.info(
        { analiseId: request.params.id },
        'exportando targeting como CSV',
      )

      const result = await fastify.targetingService.gerarZonasTargeting(
        request.params.id,
        request.query.raioKm,
        request.query.limiarScore,
      )

      const csv = fastify.targetingService.exportarCSV(result)

      request.log.info(
        { analiseId: request.params.id, linhas: result.totalZonas },
        'CSV de targeting exportado',
      )

      return reply
        .type('text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="targeting-${request.params.id}.csv"`,
        )
        .send(csv)
    },
  )
}

export default targetingRoutes
