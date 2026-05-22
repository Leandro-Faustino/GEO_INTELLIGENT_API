import { Type } from '@sinclair/typebox'

export const AnaliseResponseSchema = Type.Object(
  {
    id: Type.String(),
    clienteId: Type.String(),
    perfilId: Type.String(),
    status: Type.Union([
      Type.Literal('pendente'),
      Type.Literal('executando'),
      Type.Literal('concluida'),
    ]),
    oportunidades: Type.Integer(),
  },
  { $id: 'analises.response' },
)
