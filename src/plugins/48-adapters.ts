import fp from 'fastify-plugin'
import { type IAdaptadorFonte } from '../adapters/base-adapter.js'
import { CachedFonteAdapter } from '../adapters/cached-fonte.adapter.js'
import { AdaptadorCNPJ } from '../adapters/cnpj.adapter.js'
import { AdaptadorGeocoder } from '../adapters/geocoder.adapter.js'
import { AdaptadorIBGE } from '../adapters/ibge.adapter.js'
import { AdaptadorRegistroImoveis } from '../adapters/registro-imoveis.adapter.js'
import { ColetaService } from '../services/coleta.service.js'
import {
  IdhMunicipalService,
  validarIdhMunicipalDataset,
} from '../services/idh-municipal.service.js'
import {
  SetorCensitarioResolver,
  validarSetoresCensitariosGeoJson,
} from '../services/setor-censitario.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    readonly adapters: {
      readonly cnpj: IAdaptadorFonte
      readonly ibge: IAdaptadorFonte
      readonly geocoder: IAdaptadorFonte
      readonly registroImoveis: IAdaptadorFonte
      readonly todas: readonly IAdaptadorFonte[]
    }
    readonly coletaService: ColetaService
  }
}

export default fp(
  async function adaptersPlugin(fastify): Promise<void> {
    const cnpjAdapter = new AdaptadorCNPJ({
      apiUrl: fastify.config.CNPJ_API_URL,
      apiKey: fastify.config.CNPJ_API_KEY,
      brasilApiUrl: fastify.config.BRASILAPI_BASE_URL,
      receitaWsUrl: fastify.config.RECEITAWS_BASE_URL,
    })
    const idhService = new IdhMunicipalService({
      datasetPath: fastify.config.IDH_MUNICIPAL_DATASET_PATH,
    })
    if (fastify.config.IDH_MUNICIPAL_DATASET_PATH) {
      const validacaoIdh = await validarIdhMunicipalDataset(
        fastify.config.IDH_MUNICIPAL_DATASET_PATH,
      )
      const logPayload = {
        path: validacaoIdh.path,
        totalRegistros: validacaoIdh.totalRegistros,
        codigosDuplicados: validacaoIdh.codigosDuplicados.length,
        erros: validacaoIdh.erros,
      }

      if (validacaoIdh.valido) {
        fastify.log.info(logPayload, 'dataset de IDH municipal validado')
      } else {
        fastify.log.warn(logPayload, 'dataset de IDH municipal invalido')
      }
    }
    const ibgeAdapter = new AdaptadorIBGE({
      baseUrl: fastify.config.IBGE_BASE_URL,
      idhService,
    })
    const setorResolver = new SetorCensitarioResolver({
      geojsonPath: fastify.config.SETORES_CENSITARIOS_GEOJSON_PATH,
    })
    if (fastify.config.SETORES_CENSITARIOS_GEOJSON_PATH) {
      const validacaoSetores = await validarSetoresCensitariosGeoJson(
        fastify.config.SETORES_CENSITARIOS_GEOJSON_PATH,
      )
      const logPayload = {
        path: validacaoSetores.path,
        totalFeatures: validacaoSetores.totalFeatures,
        totalSetores: validacaoSetores.totalSetores,
        codigosDuplicados: validacaoSetores.codigosDuplicados.length,
        erros: validacaoSetores.erros,
      }

      if (validacaoSetores.valido) {
        fastify.log.info(logPayload, 'malha de setores censitarios validada')
      } else {
        fastify.log.warn(logPayload, 'malha de setores censitarios invalida')
      }
    }
    const geocoderAdapter = new AdaptadorGeocoder({
      baseUrl: fastify.config.NOMINATIM_BASE_URL,
      userAgent: fastify.config.NOMINATIM_USER_AGENT,
      throttleMs: fastify.config.NOMINATIM_THROTTLE_MS,
      setorResolver,
      providerMode: fastify.config.GEOCODER_PROVIDER_MODE,
    })
    const registroImoveisAdapter = new AdaptadorRegistroImoveis()

    const cnpj = new CachedFonteAdapter(cnpjAdapter, fastify.cache, fastify.config.CACHE_TTL_SECONDS)
    const ibge = new CachedFonteAdapter(ibgeAdapter, fastify.cache, fastify.config.CACHE_TTL_SECONDS)
    const geocoder = new CachedFonteAdapter(
      geocoderAdapter,
      fastify.cache,
      fastify.config.CACHE_TTL_SECONDS,
    )
    const registroImoveis = new CachedFonteAdapter(
      registroImoveisAdapter,
      fastify.cache,
      fastify.config.CACHE_TTL_SECONDS,
    )

    fastify.decorate('adapters', {
      cnpj,
      ibge,
      geocoder,
      registroImoveis,
      todas: [cnpj, ibge, geocoder, registroImoveis] as const,
    })
    fastify.decorate('coletaService', new ColetaService(cnpj))

    fastify.log.info(
      {
        cacheTtlSeconds: fastify.config.CACHE_TTL_SECONDS,
        fontes: [cnpj.nome, ibge.nome, geocoder.nome, registroImoveis.nome],
      },
      'adaptadores de fontes externas injetados',
    )
  },
  { name: 'app-adapters', dependencies: ['app-config', 'app-cache'] },
)
