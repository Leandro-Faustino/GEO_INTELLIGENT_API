import { Type } from '@sinclair/typebox'

export const RaioXResponse = Type.Object(
  {
    retrato: Type.Object(
      {
        frase: Type.String(),
        complemento: Type.Union([Type.String(), Type.Null()]),
      },
      { additionalProperties: false },
    ),
    fatores: Type.Array(
      Type.Object(
        {
          atributo: Type.String(),
          pesoPercentual: Type.Integer(),
          descricao: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
    estatisticas: Type.Object(
      {
        totalClientes: Type.Integer(),
        ativos: Type.Integer(),
        comRecompra: Type.Integer(),
        percentualFieis: Type.Integer(),
        ticketMedio: Type.Optional(Type.Number()),
        ticketMin: Type.Optional(Type.Number()),
        ticketMax: Type.Optional(Type.Number()),
      },
      { additionalProperties: false },
    ),
    segmentos: Type.Array(
      Type.Object(
        {
          segmento: Type.String(),
          quantidade: Type.Integer(),
          percentual: Type.Integer(),
        },
        { additionalProperties: false },
      ),
    ),
    potencial: Type.Object(
      {
        mensagem: Type.String(),
        cta: Type.String(),
      },
      { additionalProperties: false },
    ),
  },
  {
    $id: 'schema:geolead:raio-x:response',
    additionalProperties: false,
  },
)
