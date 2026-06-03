import { Type } from '@sinclair/typebox'

const ConcorrenteSchema = Type.Object({
  nome: Type.String(),
  identificador: Type.String(),
  cnae: Type.String(),
  cidade: Type.String(),
  distanciaEstimada: Type.Number(),
  presenca: Type.Array(Type.String()),
})

export const CompetitivaResponse = Type.Object(
  {
    clienteId: Type.String(),
    regiao: Type.String(),
    concorrentes: Type.Array(ConcorrenteSchema),
    totalFornecedoresRegiao: Type.Integer(),
    concentracao: Type.Union([
      Type.Literal('baixa'),
      Type.Literal('moderada'),
      Type.Literal('alta'),
    ]),
    insight: Type.String(),
  },
  { $id: 'schema:geolead:competitiva:response', additionalProperties: false },
)
