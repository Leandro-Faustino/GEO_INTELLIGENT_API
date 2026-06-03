/**
 * Rota do Raio-X do Cliente Ideal — produto de entrada.
 *
 * Decisões de design, cada uma fundamentada na documentação do projeto:
 *
 *  ESTRUTURA (Accelerating Fastify, Cap. 6-7):
 *    - Bounded context próprio (pasta raio-x/, encapsulado)
 *    - Autohook aplica autenticação (cascadeHooks)
 *    - Schemas registrados no loader via addSchema() (cross-context)
 *    - Não usa fastify-plugin na pasta routes/
 *
 *  SEGURANÇA (Accelerating Fastify, Cap. 5 + Cap. 7):
 *    - Body schema com additionalProperties:false (anti mass-assignment)
 *    - Response schema tipado (anti-vazamento: "the /filter endpoint
 *      returns a password field, but thanks to the response schema,
 *      it will not be sent to the client!")
 *    - Rate limit herdado do global + 404 com rate-limit (app.ts)
 *
 *  PERFORMANCE (Accelerating Fastify, Cap. 5):
 *    - Response schema ativa fast-json-stringify ("increases the
 *      throughput of the application, thanks to faster serialization")
 *
 *  OBSERVABILIDADE (Distributed Systems with Node.js, Cap. 4):
 *    - Logging estruturado com correlation ID (request.log)
 *    - request.id propaga via x-request-id header
 *
 *  BEST PRACTICES (Accelerating Fastify, Cap. 7):
 *    - Handler NOMEADO ("we added a name to every handler function as
 *      a best practice, since it helps to have better stack traces")
 *    - Swagger metadata (summary, description, tags, security)
 *
 *  ERROS (Accelerating Fastify, Cap. 3):
 *    - err.statusCode muda o HTTP status code
 *    - Erros 5xx não expõem stack/detalhes internos ao cliente
 *    - Error handler central cuida do formato padronizado
 */
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
        summary: 'Raio-X do Cliente Ideal',
        description:
          'Produto de entrada. Recebe a base de compradores e devolve um ' +
          'relatório rico: retrato do cliente ideal, fatores que mais definem, ' +
          'estatísticas, segmentos descobertos e o potencial de mercado.',
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
    // Handler NOMEADO — best practice Cap. 7: "better stack traces"
    async function gerarRaioX(request, reply) {
      if (!fastify.motor) {
        request.log.error('motor indisponível para Raio-X')
        return reply.code(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Motor de inteligência indisponível.',
        })
      }

      // Log estruturado: o Pino injeta reqId automaticamente
      // (Distributed Systems Cap. 4: correlation ID)
      request.log.info(
        { compradores: request.body.compradores.length },
        'gerando Raio-X do Cliente Ideal',
      )

      // Anti-corruption layer: camelCase (gateway) → snake_case (motor)
      // TypeScript Microservices Cap. 5: "gateways should not contain
      // non-generic logic" — tradução de formato é genérica.
      const payload = {
        compradores: request.body.compradores.map((c) => ({
          identificador: c.identificador,
          nome: c.nome,
          tipo: c.tipo,
          atributos_originais: c.atributosOriginais,
          ticket_medio: c.ticketMedio,
          frequencia: c.frequencia,
          ativo: c.ativo,
        })),
      }

      try {
        const relatorio = await fastify.motor.raioX(payload, request.id)

        request.log.info('Raio-X gerado com sucesso')
        return reply.code(200).send(relatorio as unknown as RaioXOut)
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode: number }).statusCode
            : 503

        if (statusCode === 422) {
          request.log.warn(
            { err: err instanceof Error ? err.message : 'dados insuficientes' },
            'Raio-X rejeitado: pré-condição não atendida',
          )
          return reply.code(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: err instanceof Error ? err.message : 'Dados insuficientes.',
          })
        }

        // Erros 5xx: NÃO expor stack/detalhes ao cliente
        // (Fastify Cap. 3: error handler filtra a mensagem)
        request.log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'falha ao gerar Raio-X',
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

export default raioXRoutes
