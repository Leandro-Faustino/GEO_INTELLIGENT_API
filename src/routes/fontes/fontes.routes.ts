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
        description: 'Lista adapters disponíveis e o estado atual do circuit breaker.',
        tags: ['Fontes'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Array(
            Type.Object({
              nome: Type.String(),
              modo: Type.String(),
              circuitState: Type.String(),
              consecutiveFailures: Type.Integer(),
            }),
          ),
        },
      },
    },
    async () =>
      fastify.adapters.todas.map((adapter) => {
        const raw = (adapter as { circuitState?: string }).circuitState ?? 'closed'
        const circuitState = raw.replace('-', '_').toUpperCase()
        return {
          nome: adapter.nome,
          modo: 'mock',
          circuitState,
          consecutiveFailures: 0,
        }
      }),
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
    async (request) => {
      const adapter = resolverAdapter(fastify, request.params.fonte)
      const resultados = await adapter.consultar(request.body.parametros)

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
    async (request) => {
      const adapter = resolverAdapter(fastify, request.params.fonte)
      return adapter.enriquecer(request.body.identificador)
    },
  )
}

function resolverAdapter(
  fastify: FastifyInstance,
  fonte: string,
) {
  const adapters = {
    cnpj: fastify.adapters.cnpj,
    ibge: fastify.adapters.ibge,
    geocoder: fastify.adapters.geocoder,
    'registro-imoveis': fastify.adapters.registroImoveis,
  }

  return adapters[fonte as keyof typeof adapters]
}

export default fontesRoutes
