/**
 * Rota de Inteligência Competitiva (C2.3).
 *
 * Mapeia quem mais fornece para o mesmo perfil de cliente na região.
 * No v1, usa inferência por CNAE de fornecimento.
 */
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { AnalisarCompetitivaBody, CompetitivaResponse } from '../../schemas/competitiva/index.js'
import { ErrorResponse } from '../../schemas/shared/index.js'

const competitivaRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/competitiva/analisar',
    {
      schema: {
        summary: 'Analisar cenário competitivo',
        description:
          'Identifica potenciais concorrentes na região — empresas com CNAE de ' +
          'fornecimento compatível com o perfil ideal do cliente.',
        tags: ['Competitiva'],
        security: [{ bearerAuth: [] }],
        body: AnalisarCompetitivaBody,
        response: { 200: CompetitivaResponse, 404: ErrorResponse },
      },
    },
    async function analisarCompetitiva(request, reply) {
      request.log.info(
        { clienteId: request.body.clienteId, regiao: request.body.regiao },
        'analisando cenário competitivo',
      )

      const resultado = await fastify.competitivaService.analisar(
        request.body.clienteId,
        request.body.regiao,
      )

      request.log.info(
        { concorrentes: resultado.totalFornecedoresRegiao, concentracao: resultado.concentracao },
        'análise competitiva concluída',
      )

      return reply.code(200).send(resultado)
    },
  )
}

export default competitivaRoutes
