import { Type } from '@sinclair/typebox'

const ConcorrenteResponse = Type.Object({
  nome: Type.String(),
  identificador: Type.String(),
  cnae: Type.String(),
  cidade: Type.String(),
  distanciaEstimada: Type.Number({ minimum: 0 }),
  presenca: Type.Array(Type.String()),
})

export const AnalisarCompetitivaBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    regiao: Type.String({ minLength: 1, maxLength: 200 }),
  },
  {
    $id: 'schema:geolead:competitiva:analisar-body',
    additionalProperties: false,
  },
)

export const CompetitivaResponse = Type.Object(
  {
    clienteId: Type.String(),
    regiao: Type.String(),
    concorrentes: Type.Array(ConcorrenteResponse),
    totalFornecedoresRegiao: Type.Integer(),
    concentracao: Type.String({ enum: ['baixa', 'moderada', 'alta'] }),
    insight: Type.String(),
  },
  { $id: 'schema:geolead:competitiva:response' },
)

export const competitivaSchemas = [
  AnalisarCompetitivaBody,
  CompetitivaResponse,
]
