import fp from 'fastify-plugin'
import { type IAdaptadorFonte } from '../adapters/base-adapter.js'
import { AdaptadorCNPJ } from '../adapters/cnpj.adapter.js'
import { AdaptadorGeocoder } from '../adapters/geocoder.adapter.js'
import { AdaptadorIBGE } from '../adapters/ibge.adapter.js'
import { AdaptadorRegistroImoveis } from '../adapters/registro-imoveis.adapter.js'

declare module 'fastify' {
  interface FastifyInstance {
    readonly adapters: {
      readonly cnpj: AdaptadorCNPJ
      readonly ibge: AdaptadorIBGE
      readonly geocoder: AdaptadorGeocoder
      readonly registroImoveis: AdaptadorRegistroImoveis
      readonly todas: readonly IAdaptadorFonte[]
    }
  }
}

export default fp(
  async function adaptersPlugin(fastify): Promise<void> {
    const cnpj = new AdaptadorCNPJ()
    const ibge = new AdaptadorIBGE()
    const geocoder = new AdaptadorGeocoder()
    const registroImoveis = new AdaptadorRegistroImoveis()

    fastify.decorate('adapters', {
      cnpj,
      ibge,
      geocoder,
      registroImoveis,
      todas: [cnpj, ibge, geocoder, registroImoveis] as const,
    })

    fastify.log.info(
      { fontes: [cnpj.nome, ibge.nome, geocoder.nome, registroImoveis.nome] },
      'adaptadores de fontes externas injetados',
    )
  },
  { name: 'app-adapters', dependencies: ['app-config'] },
)
