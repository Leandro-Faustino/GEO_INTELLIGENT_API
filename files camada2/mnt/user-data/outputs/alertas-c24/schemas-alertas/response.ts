import { Type } from '@sinclair/typebox'

const AlertaItem = Type.Object({
  id: Type.String(),
  clienteId: Type.String(),
  tipo: Type.String(),
  entidadeAlvoId: Type.String(),
  entidadeNome: Type.String(),
  entidadeCidade: Type.String(),
  score: Type.Number(),
  mensagem: Type.String(),
  status: Type.String(),
  criadoEm: Type.String({ format: 'date-time' }),
})

export const ScanAlertasResponse = Type.Object(
  {
    alertasGerados: Type.Array(AlertaItem),
    totalEscaneadas: Type.Integer(),
  },
  { $id: 'schema:geolead:alertas:scan-response', additionalProperties: false },
)

export const ListaAlertasResponse = Type.Array(AlertaItem, {
  $id: 'schema:geolead:alertas:lista-response',
})

export const AlertaResponse = AlertaItem
