import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { type Static } from '@sinclair/typebox'
import { RaioXBody, RaioXResponse } from '../../schemas/raio-x/index.js'
import { ErrorResponse } from '../../schemas/shared/index.js'

type RaioXOut = Static<typeof RaioXResponse>

const raioXRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/raio-x',
    {
      schema: {
        summary: 'Raio-X do cliente ideal',
        description:
          'Recebe a base de compradores e devolve um retrato do cliente ideal com fatores, estatísticas, segmentos e potencial de mercado.',
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
      if (!fastify.motor) {
        request.log.error('motor indisponivel para raio-x')
        return reply.code(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Motor de inteligência indisponível.',
        })
      }

      request.log.info(
        {
          compradores: request.body.compradores.length,
        },
        'gerando raio-x do cliente ideal',
      )

      const payload = {
        compradores: request.body.compradores.map((comprador) => ({
          identificador: comprador.identificador,
          nome: comprador.nome,
          tipo: comprador.tipo,
          atributos_originais: comprador.atributosOriginais,
          ticket_medio: comprador.ticketMedio,
          frequencia: comprador.frequencia,
          ativo: comprador.ativo,
        })),
      }

      try {
        const relatorio = await fastify.motor.raioX(payload, request.id)
        request.log.info(
          {
            segmentos: arrayCampo(relatorio, 'segmentos').length,
            fatores: arrayCampo(relatorio, 'fatores').length,
          },
          'raio-x gerado com sucesso',
        )
        return reply.code(200).send(relatorio as RaioXOut)
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? Number((error as { statusCode: unknown }).statusCode)
            : 503

        if (statusCode === 422) {
          request.log.warn(
            { err: error instanceof Error ? error.message : 'dados insuficientes' },
            'raio-x rejeitado por pre-condicao',
          )
          return reply.code(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message:
              error instanceof Error ? error.message : 'Dados insuficientes para gerar o Raio-X.',
          })
        }

        request.log.error(
          { err: error instanceof Error ? error.message : String(error) },
          'falha ao gerar raio-x',
        )
        return reply.code(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Não foi possível gerar o Raio-X no momento.',
        })
      }
    },
  )
}

function arrayCampo(origem: Record<string, unknown>, nome: string): unknown[] {
  const valor = origem[nome]
  return Array.isArray(valor) ? valor : []
}

export default raioXRoutes
