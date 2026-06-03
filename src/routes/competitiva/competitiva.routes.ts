import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'
import {
  AnalisarCompetitivaBody,
  CompetitivaResponse,
} from '../../schemas/competitiva/index.js'
import { assertClienteDoUsuario } from '../helpers/assert-cliente-owner.js'

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
      const cliente = await assertClienteDoUsuario(
        fastify,
        request.body.clienteId,
        request.user.sub,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          regiao: request.body.regiao,
        },
        'analisando cenário competitivo',
      )

      const resultado = await fastify.competitivaService.analisar(
        cliente.id,
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
