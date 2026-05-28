import { Type } from '@sinclair/typebox'

export const AlertaResponse = Type.Object(
  {
    id: Type.String(),
    clienteId: Type.String(),
    tipo: Type.String(),
    entidadeAlvoId: Type.String(),
    entidadeNome: Type.String(),
    entidadeCidade: Type.String(),
    score: Type.Number({ minimum: 0, maximum: 1 }),
    mensagem: Type.String(),
    status: Type.String({ enum: ['novo', 'visto', 'descartado', 'convertido'] }),
    criadoEm: Type.String({ format: 'date-time' }),
  },
  { $id: 'schema:geolead:alertas:item' },
)

export const ScanAlertasResponse = Type.Object(
  {
    alertasGerados: Type.Array(AlertaResponse),
    totalEscaneadas: Type.Integer(),
  },
  {
    $id: 'schema:geolead:alertas:scan-response',
    additionalProperties: false,
  },
)

export const ListaAlertasResponse = Type.Array(AlertaResponse, {
  $id: 'schema:geolead:alertas:lista-response',
})

export const AtualizarAlertaResponse = Type.Object(
  {
    id: Type.String(),
    status: Type.String({ enum: ['novo', 'visto', 'descartado', 'convertido'] }),
  },
  {
    $id: 'schema:geolead:alertas:atualizar-response',
    additionalProperties: false,
  },
)
