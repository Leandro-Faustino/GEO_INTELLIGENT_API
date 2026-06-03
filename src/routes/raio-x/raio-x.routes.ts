import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { RaioXBody, RaioXResponse } from '../../schemas/raio-x/index.js'
import { ErrorResponse } from '../../schemas/shared/index.js'
import { statusCodeFromError } from '../helpers/motor-errors.js'
import { calcularRaioXLocal } from '../../services/raio-x.service.js'

const raioXRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/raio-x',
    {
      schema: {
        summary: 'Raio-X do cliente ideal',
        description:
          'Recebe a base de compradores e devolve um retrato do cliente ideal com fatores, ' +
          'estatísticas, segmentos e potencial de mercado. ' +
          'Usa o motor Python quando disponível; caso contrário, aplica análise estatística local.',
        tags: ['Raio-X'],
        security: [{ bearerAuth: [] }],
        body: RaioXBody,
        response: {
          200: RaioXResponse,
          422: ErrorResponse,
          503: ErrorResponse,
        },
      },
    },
    async function gerarRaioX(request, reply) {
      const compradores = request.body.compradores

      request.log.info({ compradores: compradores.length }, 'gerando raio-x do cliente ideal')

      // Tenta motor Python quando configurado
      if (fastify.motor) {
        try {
          const relatorio = await fastify.motor.raioX({ compradores }, request.id)
          request.log.info(
            { segmentos: relatorio.segmentos.length, fatores: relatorio.fatores.length },
            'raio-x gerado pelo motor',
          )
          return reply.code(200).send(relatorio)
        } catch (error) {
          const statusCode = statusCodeFromError(error)

          if (statusCode === 422) {
            return reply.code(422).send({
              statusCode: 422,
              error: 'Unprocessable Entity',
              message:
                error instanceof Error
                  ? error.message
                  : 'Dados insuficientes para gerar o Raio-X.',
            })
          }

          // Motor indisponível → fallback local (não retorna 503)
          request.log.warn(
            { err: error instanceof Error ? error.message : String(error) },
            'motor indisponivel para raio-x, usando calculo local',
          )
        }
      }

      // Fallback local: análise estatística sem ML
      try {
        const relatorio = calcularRaioXLocal(compradores)
        request.log.info(
          { segmentos: relatorio.segmentos.length, fatores: relatorio.fatores.length },
          'raio-x gerado localmente (fallback)',
        )
        return reply.code(200).send(relatorio)
      } catch (error) {
        const statusCode = statusCodeFromError(error)
        if (statusCode === 422) {
          return reply.code(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message:
              error instanceof Error
                ? error.message
                : 'Dados insuficientes para gerar o Raio-X.',
          })
        }
        throw error
      }
    },
  )
}

export default raioXRoutes
