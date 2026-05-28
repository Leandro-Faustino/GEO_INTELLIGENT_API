import { Type } from '@sinclair/typebox'

export const ScanAlertasBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    escopo: Type.String({ minLength: 1, maxLength: 200 }),
    limiar: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.5 })),
  },
  {
    $id: 'schema:geolead:alertas:scan-body',
    additionalProperties: false,
  },
)

export const AtualizarAlertaBody = Type.Object(
  {
    status: Type.Union([
      Type.Literal('visto'),
      Type.Literal('descartado'),
      Type.Literal('convertido'),
    ]),
  },
  {
    $id: 'schema:geolead:alertas:atualizar-body',
    additionalProperties: false,
  },
)
