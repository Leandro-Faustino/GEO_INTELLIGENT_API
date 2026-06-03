import { Type } from '@sinclair/typebox'

const OportunidadeTerritorio = Type.Object({
  nome: Type.String(),
  identificador: Type.String(),
  score: Type.Number({ minimum: 0, maximum: 1 }),
})

const RegiaoAnalise = Type.Object({
  nome: Type.String(),
  totalEntidades: Type.Integer(),
  naoAtendidos: Type.Integer(),
  potencialMedio: Type.Number({ minimum: 0, maximum: 1 }),
  scoreMaisAlto: Type.Number({ minimum: 0, maximum: 1 }),
  cobertura: Type.Number({ minimum: 0, maximum: 1 }),
  oportunidadesTop3: Type.Array(OportunidadeTerritorio),
})

export const AnalisarTerritorioBody = Type.Object(
  {
    clienteId: Type.String({ minLength: 1 }),
    regioes: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
      minItems: 1,
    }),
    limiar: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.3 })),
  },
  {
    $id: 'schema:geolead:territorio:analisar-body',
    additionalProperties: false,
  },
)

export const TerritorioResponse = Type.Object(
  {
    clienteId: Type.String(),
    regioesAnalisadas: Type.Integer(),
    regioes: Type.Array(RegiaoAnalise),
    regiaoRecomendada: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'schema:geolead:territorio:response' },
)

export const territorioSchemas = [
  AnalisarTerritorioBody,
  TerritorioResponse,
]
