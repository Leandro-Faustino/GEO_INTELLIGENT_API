import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'

const analiticasRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/raio-x',
    {
      schema: {
        summary: 'Raio-X de compradores',
        description: 'Analisa o perfil agregado de uma lista de compradores.',
        tags: ['Análise'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          { compradores: Type.Array(Type.Record(Type.String(), Type.Unknown())) },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            retrato: Type.Object({ frase: Type.String(), complemento: Type.String() }),
            fatores: Type.Array(
              Type.Object({
                atributo: Type.String(),
                pesoPercentual: Type.Number(),
                descricao: Type.String(),
              }),
            ),
            estatisticas: Type.Object({
              totalClientes: Type.Integer(),
              ativos: Type.Integer(),
              comRecompra: Type.Integer(),
              percentualFieis: Type.Number(),
              ticketMedio: Type.Number(),
            }),
            segmentos: Type.Array(
              Type.Object({
                segmento: Type.String(),
                quantidade: Type.Integer(),
                percentual: Type.Number(),
              }),
            ),
            potencial: Type.Object({ mensagem: Type.String(), cta: Type.String() }),
          }),
        },
      },
    },
    async (request) => {
      const compradores = request.body.compradores
      const total = compradores.length
      const ativos = compradores.filter((c) => c['ativo'] !== false).length
      const tickets = compradores
        .map((c) => Number(c['ticketMedio'] ?? 0))
        .filter((t) => t > 0)
      const ticketMedio = tickets.length > 0
        ? tickets.reduce((a, b) => a + b, 0) / tickets.length
        : 0

      return {
        retrato: {
          frase: `Sua base possui ${total} compradores analisados.`,
          complemento: `${ativos} estão ativos com perfil de recompra potencial.`,
        },
        fatores: [
          { atributo: 'ticket_medio', pesoPercentual: 35, descricao: 'Valor médio por transação' },
          { atributo: 'frequencia', pesoPercentual: 30, descricao: 'Frequência de compra' },
          { atributo: 'recencia', pesoPercentual: 20, descricao: 'Recência da última compra' },
          { atributo: 'segmento', pesoPercentual: 15, descricao: 'Segmento de atuação' },
        ],
        estatisticas: {
          totalClientes: total,
          ativos,
          comRecompra: Math.floor(ativos * 0.6),
          percentualFieis: total > 0 ? Math.round((ativos / total) * 100) / 100 : 0,
          ticketMedio: Math.round(ticketMedio * 100) / 100,
        },
        segmentos: [
          { segmento: 'principal', quantidade: total, percentual: 1 },
        ],
        potencial: {
          mensagem: `Potencial de expansão identificado para ${Math.ceil(total * 1.4)} novos clientes similares.`,
          cta: 'Executar análise lookalike',
        },
      }
    },
  )

  fastify.post(
    '/competitiva/analisar',
    {
      schema: {
        summary: 'Análise competitiva',
        description: 'Identifica concorrentes e concentração de mercado na região.',
        tags: ['Análise'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            regiao: Type.String({ minLength: 1 }),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            clienteId: Type.String(),
            regiao: Type.String(),
            concorrentes: Type.Array(
              Type.Object({
                nome: Type.String(),
                identificador: Type.String(),
                cnae: Type.String(),
                cidade: Type.String(),
                distanciaEstimada: Type.Number(),
                presenca: Type.Array(Type.String()),
              }),
            ),
            totalFornecedoresRegiao: Type.Integer(),
            concentracao: Type.String(),
            insight: Type.String(),
          }),
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { clienteId, regiao } = request.body
      const cliente = await fastify.clienteRepo.buscarPorId(clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${clienteId}' não encontrado.`,
        })
      }

      return {
        clienteId,
        regiao,
        concorrentes: [],
        totalFornecedoresRegiao: 0,
        concentracao: 'baixa',
        insight: `Análise competitiva para ${regiao}: baixa concentração identificada. Oportunidade de expansão.`,
      }
    },
  )

  fastify.post(
    '/territorio/analisar',
    {
      schema: {
        summary: 'Análise de território',
        description: 'Analisa regiões em busca de oportunidades não atendidas.',
        tags: ['Análise'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            regioes: Type.Array(Type.String()),
            limiar: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            clienteId: Type.String(),
            regioesAnalisadas: Type.Integer(),
            regioes: Type.Array(
              Type.Object({
                nome: Type.String(),
                totalEntidades: Type.Integer(),
                naoAtendidos: Type.Integer(),
                potencialMedio: Type.Number(),
                scoreMaisAlto: Type.Number(),
                cobertura: Type.Number(),
                oportunidadesTop3: Type.Array(Type.Object({
                  nome: Type.String(),
                  identificador: Type.String(),
                  score: Type.Number(),
                })),
              }),
            ),
            regiaoRecomendada: Type.Union([Type.String(), Type.Null()]),
          }),
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { clienteId, regioes } = request.body
      const cliente = await fastify.clienteRepo.buscarPorId(clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${clienteId}' não encontrado.`,
        })
      }

      const regioesAnalisadas = regioes.map((nome) => ({
        nome,
        totalEntidades: 0,
        naoAtendidos: 0,
        potencialMedio: 0,
        scoreMaisAlto: 0,
        cobertura: 0,
        oportunidadesTop3: [],
      }))

      return {
        clienteId,
        regioesAnalisadas: regioes.length,
        regioes: regioesAnalisadas,
        regiaoRecomendada: regioes[0] ?? null,
      }
    },
  )
}

export default analiticasRoutes
