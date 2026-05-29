/**
 * Rota de Análise de Território (C2.1).
 *
 * Compara múltiplas regiões por potencial de mercado não atendido.
 * Ranqueia e recomenda a melhor região para expandir.
 */
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { AnalisarTerritorioBody, TerritorioResponse } from '../../schemas/territorio/index.js'
import { ErrorResponse } from '../../schemas/shared/index.js'

const territorioRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/territorio/analisar',
    {
      schema: {
        summary: 'Analisar potencial de território',
        description:
          'Compara múltiplas regiões por potencial de mercado não atendido. ' +
          'Identifica onde há alta concentração de perfis similares sem cobertura.',
        tags: ['Território'],
        security: [{ bearerAuth: [] }],
        body: AnalisarTerritorioBody,
        response: { 200: TerritorioResponse, 404: ErrorResponse },
      },
    },
    async function analisarTerritorio(request, reply) {
      request.log.info(
        { clienteId: request.body.clienteId, regioes: request.body.regioes },
        'analisando território',
      )

      const resultado = await fastify.territorioService.analisar(
        request.body.clienteId,
        request.body.regioes,
        request.body.limiar,
      )

      request.log.info(
        {
          regioesAnalisadas: resultado.regioesAnalisadas,
          recomendada: resultado.regiaoRecomendada,
        },
        'análise de território concluída',
      )

      return reply.code(200).send(resultado)
    },
  )
}

export default territorioRoutes
