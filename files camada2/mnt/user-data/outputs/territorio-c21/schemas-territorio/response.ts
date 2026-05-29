import { Type } from '@sinclair/typebox'

const OportunidadeTop = Type.Object({
  nome: Type.String(),
  identificador: Type.String(),
  score: Type.Number(),
})

const RegiaoSchema = Type.Object({
  nome: Type.String(),
  totalCandidatos: Type.Integer(),
  naoAtendidos: Type.Integer(),
  potencialMedio: Type.Number(),
  scoreMaisAlto: Type.Number(),
  cobertura: Type.Number(),
  oportunidadesTop3: Type.Array(OportunidadeTop),
})

export const TerritorioResponse = Type.Object(
  {
    clienteId: Type.String(),
    regioesAnalisadas: Type.Integer(),
    regioes: Type.Array(RegiaoSchema),
    regiaoRecomendada: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'schema:geolead:territorio:response', additionalProperties: false },
)
