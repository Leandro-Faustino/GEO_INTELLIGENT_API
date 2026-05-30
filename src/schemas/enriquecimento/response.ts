import { Type } from '@sinclair/typebox'

const CriterioSchema = Type.Object({
  nome: Type.String(),
  valorMin: Type.Unknown(),
  valorMax: Type.Unknown(),
  peso: Type.Number(),
  tipoComparacao: Type.String(),
})

const NovoFatorSchema = Type.Object({
  atributo: Type.String(),
  peso: Type.Number(),
  pesoPercentual: Type.Integer(),
  suporte: Type.Number({ minimum: 0, maximum: 1 }),
  descricao: Type.String(),
  fonte: Type.String(),
})

export const EnriquecimentoResponse = Type.Object(
  {
    perfilOriginal: Type.Object({
      totalFatores: Type.Integer(),
      criterios: Type.Array(CriterioSchema),
    }),
    perfilEnriquecido: Type.Object({
      totalFatores: Type.Integer(),
      criterios: Type.Array(CriterioSchema),
    }),
    novosFatores: Type.Array(NovoFatorSchema),
    fontesConsultadas: Type.Array(Type.String()),
    fontesComFalha: Type.Array(Type.String()),
    compradoresEnriquecidos: Type.Integer(),
  },
  {
    $id: 'schema:geolead:enriquecimento:response',
    additionalProperties: false,
  },
)
