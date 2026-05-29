import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'
import {
  AnalisarTerritorioBody,
  TerritorioResponse,
} from '../../schemas/territorio/index.js'

const territorioRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/territorio/analisar',
    {
      schema: {
        summary: 'Analisar potencial de território',
        description:
          'Compara múltiplas regiões por potencial de mercado não atendido e recomenda a melhor área para expansão.',
        tags: ['Território'],
        security: [{ bearerAuth: [] }],
        body: AnalisarTerritorioBody,
        response: {
          200: TerritorioResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async function analisarTerritorioHandler(request, reply) {
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
          regioes: request.body.regioes,
          limiar: request.body.limiar ?? 0.3,
        },
        'analisando território',
      )

      const resultado = await fastify.territorioService.analisar(
        request.body.clienteId,
        request.body.regioes,
        request.body.limiar,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          recomendada: resultado.regiaoRecomendada,
          regioesAnalisadas: resultado.regioesAnalisadas,
        },
        'análise de território concluída',
      )

      return reply.code(200).send(resultado)
    },
  )
}

export default territorioRoutes
