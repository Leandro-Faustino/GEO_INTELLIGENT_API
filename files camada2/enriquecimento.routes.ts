/**
 * Rota de Enriquecimento de Perfil (C2.2).
 *
 * Amplia os atributos dos compradores com fontes externas e re-deriva
 * o perfil, revelando fatores ocultos que definem os melhores clientes.
 *
 * Práticas (fundamentadas na documentação):
 *  - Promise.allSettled para chamadas paralelas (fallback parcial)
 *  - Handler nomeado (Fastify Cap. 7)
 *  - Response schema tipado (Cap. 5: anti-vazamento + throughput)
 *  - Logging estruturado (Distributed Systems Cap. 4)
 */
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { EnriquecerPerfilBody, EnriquecimentoResponse } from '../../schemas/enriquecimento/index.js'
import { ErrorResponse } from '../../schemas/shared/index.js'
import { EnriquecimentoService } from '../../services/enriquecimento.service.js'

const enriquecimentoRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/perfis/enriquecer',
    {
      schema: {
        summary: 'Enriquecer perfil com fontes externas',
        description:
          'Amplia os atributos dos compradores com dados de fontes externas ' +
          '(CNPJ, IBGE, Geocoder), re-deriva o perfil com os atributos novos ' +
          'e mostra quais fatores foram descobertos.',
        tags: ['Perfis'],
        security: [{ bearerAuth: [] }],
        body: EnriquecerPerfilBody,
        response: { 200: EnriquecimentoResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    async function enriquecerPerfil(request, reply) {
      request.log.info(
        { clienteId: request.body.clienteId, fontes: request.body.fontes },
        'enriquecendo perfil com fontes externas',
      )

      // Monta as fontes a partir dos adapters disponíveis (injetados
      // pelo plugin 48-adapters). Cada adapter já tem circuit breaker.
      const fontesDisponiveis = fastify.adapters.todas.map((a) => ({
        nome: a.nome,
        adapter: a,
      }))
      const service = new EnriquecimentoService(
        fastify.baseInternaRepo,
        fastify.perfilRepo,
        fontesDisponiveis,
      )

      const resultado = await service.enriquecer(
        request.body.clienteId,
        request.body.fontes,
      )

      request.log.info(
        {
          fatoresOriginais: resultado.perfilOriginal.totalFatores,
          fatoresEnriquecidos: resultado.perfilEnriquecido.totalFatores,
          novosFatores: resultado.novosFatores.length,
          fontesComFalha: resultado.fontesComFalha,
        },
        'enriquecimento concluído',
      )

      return reply.code(200).send(resultado)
    },
  )
}

export default enriquecimentoRoutes
