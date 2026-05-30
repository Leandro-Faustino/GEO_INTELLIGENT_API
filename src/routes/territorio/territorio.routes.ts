import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'
import {
  AnalisarTerritorioBody,
  TerritorioResponse,
} from '../../schemas/territorio/index.js'
import { assertClienteDoUsuario } from '../helpers/assert-cliente-owner.js'

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
      const cliente = await assertClienteDoUsuario(
        fastify,
        request.body.clienteId,
        request.user.sub,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          regioes: request.body.regioes,
          limiar: request.body.limiar ?? 0.3,
        },
        'analisando território',
      )

      const resultado = await fastify.territorioService.analisar(
        cliente.id,
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
