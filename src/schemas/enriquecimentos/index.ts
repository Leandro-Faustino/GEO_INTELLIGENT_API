import { Type } from '@sinclair/typebox'

export const EnriquecimentoCompradorResponse = Type.Object({
  id: Type.String(),
  clienteId: Type.String(),
  compradorIdentificador: Type.String(),
  compradorNome: Type.String(),
  fonte: Type.String(),
  status: Type.Union([Type.Literal('sucesso'), Type.Literal('falha')]),
  payload: Type.Record(Type.String(), Type.Unknown()),
  erro: Type.String(),
  createdAt: Type.String(),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
})

export const ListaEnriquecimentosResponse = Type.Array(EnriquecimentoCompradorResponse)
