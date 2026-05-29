import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'
import {
  AnalisarCompetitivaBody,
  CompetitivaResponse,
} from '../../schemas/competitiva/index.js'

const competitivaRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/competitiva/analisar',
    {
      schema: {
        summary: 'Analisar cenário competitivo',
        description:
          'Identifica potenciais concorrentes por inferência de CNAE de fornecimento compatível com o perfil ideal.',
        tags: ['Competitiva'],
        security: [{ bearerAuth: [] }],
        body: AnalisarCompetitivaBody,
        response: {
          200: CompetitivaResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          422: ErrorResponse,
        },
      },
    },
    async function analisarCompetitivaHandler(request, reply) {
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
          regiao: request.body.regiao,
        },
        'analisando cenário competitivo',
      )

      const resultado = await fastify.competitivaService.analisar(
        request.body.clienteId,
        request.body.regiao,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          totalConcorrentes: resultado.totalFornecedoresRegiao,
          concentracao: resultado.concentracao,
        },
        'análise competitiva concluída',
      )

      return reply.code(200).send(resultado)
    },
  )
}

export default competitivaRoutes
