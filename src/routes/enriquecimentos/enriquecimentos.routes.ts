import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { ListaEnriquecimentosResponse } from '../../schemas/enriquecimentos/index.js'
import { ErrorResponse } from '../../schemas/shared/index.js'
import { assertClienteDoUsuario } from '../helpers/assert-cliente-owner.js'

const enriquecimentosRoutes: FastifyPluginAsyncTypebox = async (
  fastify,
): Promise<void> => {
  fastify.get(
    '/enriquecimentos/compradores',
    {
      schema: {
        summary: 'Listar enriquecimentos de compradores',
        description:
          'Lista o histórico auditável de payloads normalizados recebidos de fontes externas por comprador.',
        tags: ['Enriquecimentos'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            compradorIdentificador: Type.Optional(Type.String({ minLength: 1 })),
            fonte: Type.Optional(Type.String({ minLength: 1 })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: ListaEnriquecimentosResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async function listarEnriquecimentosHandler(request) {
      const cliente = await assertClienteDoUsuario(
        fastify,
        request.query.clienteId,
        request.user.sub,
      )

      const filtros: { compradorIdentificador?: string; fonte?: string } = {}
      if (request.query.compradorIdentificador) {
        filtros.compradorIdentificador = request.query.compradorIdentificador
      }
      if (request.query.fonte) {
        filtros.fonte = request.query.fonte
      }

      return fastify.enriquecimentoCompradorRepo.buscarPorCliente(cliente.id, filtros)
    },
  )
}

export default enriquecimentosRoutes
