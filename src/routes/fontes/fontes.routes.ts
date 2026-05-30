import { type FastifyInstance } from 'fastify'
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'

const FonteParams = Type.Object(
  {
    fonte: Type.String({
      enum: ['cnpj', 'ibge', 'geocoder', 'registro-imoveis'],
    }),
  },
  { additionalProperties: false },
)

const fontesRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/fontes',
    {
      schema: {
        summary: 'Listar fontes externas',
        description:
          'Lista adapters disponíveis, seu modo operacional atual e o estado do circuit breaker.',
        tags: ['Fontes'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Array(
            Type.Object({
              nome: Type.String(),
              modo: Type.String({ enum: ['real', 'mock', 'hibrido'] }),
              circuitState: Type.String(),
              consecutiveFailures: Type.Integer({ minimum: 0 }),
              providerMode: Type.Optional(Type.String()),
              isOptional: Type.Optional(Type.Boolean()),
              observacao: Type.Optional(Type.String()),
            }),
          ),
        },
      },
    },
    async function listarFontesHandler() {
      return fastify.adapters.todas.map((adapter) => ({
        nome: adapter.nome,
        modo: adapter.modo,
        circuitState: adapter.circuitState,
        consecutiveFailures: adapter.consecutiveFailures,
        ...(adapter.providerMode ? { providerMode: adapter.providerMode } : {}),
        ...(adapter.isOptional ? { isOptional: adapter.isOptional } : {}),
        ...(adapter.observacao ? { observacao: adapter.observacao } : {}),
      }))
    },
  )

  fastify.post(
    '/fontes/:fonte/consultar',
    {
      schema: {
        summary: 'Consultar fonte externa',
        description: 'Busca entidades ou eventos em uma fonte externa normalizada.',
        tags: ['Fontes'],
        security: [{ bearerAuth: [] }],
        params: FonteParams,
        body: Type.Object(
          {
            parametros: Type.Record(Type.String(), Type.Unknown()),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            fonte: Type.String(),
            total: Type.Integer(),
            resultados: Type.Array(Type.Record(Type.String(), Type.Unknown())),
          }),
          400: ErrorResponse,
          503: ErrorResponse,
        },
      },
    },
    async function consultarFonteHandler(request) {
      request.log.info(
        { fonte: request.params.fonte, parametros: request.body.parametros },
        'consulta em fonte externa solicitada',
      )
      const adapter = resolverAdapter(fastify, request.params.fonte)
      const resultados = await adapter.consultar(request.body.parametros)

      request.log.info(
        { fonte: adapter.nome, total: resultados.length },
        'consulta em fonte externa concluida',
      )
      return {
        fonte: adapter.nome,
        total: resultados.length,
        resultados,
      }
    },
  )

  fastify.post(
    '/fontes/:fonte/enriquecer',
    {
      schema: {
        summary: 'Enriquecer por fonte externa',
        description: 'Enriquece uma entidade ou identificador usando uma fonte externa.',
        tags: ['Fontes'],
        security: [{ bearerAuth: [] }],
        params: FonteParams,
        body: Type.Object(
          { identificador: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Record(Type.String(), Type.Unknown()),
          400: ErrorResponse,
          503: ErrorResponse,
        },
      },
    },
    async function enriquecerFonteHandler(request) {
      request.log.info(
        { fonte: request.params.fonte, identificador: request.body.identificador },
        'enriquecimento em fonte externa solicitado',
      )
      const adapter = resolverAdapter(fastify, request.params.fonte)
      const resultado = await adapter.enriquecer(request.body.identificador)
      request.log.info({ fonte: adapter.nome }, 'enriquecimento em fonte externa concluido')
      return resultado
    },
  )
}

function resolverAdapter(
  fastify: FastifyInstance,
  fonte: string,
): FastifyInstance['adapters']['todas'][number] {
  const adapters = {
    cnpj: fastify.adapters.cnpj,
    ibge: fastify.adapters.ibge,
    geocoder: fastify.adapters.geocoder,
    'registro-imoveis': fastify.adapters.registroImoveis,
  }

  return adapters[fonte as keyof typeof adapters]
}

export default fontesRoutes
