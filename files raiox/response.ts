/**
 * Schema de response para o Raio-X do Cliente Ideal.
 *
 * Accelerating Fastify, Cap. 5: "Defining a response body adds two
 * main benefits: It prevents us from leaking undesired information
 * to clients AND It increases the throughput of the application,
 * thanks to the faster serialization."
 *
 * Cap. 5: "The /filter endpoint returns a password field, but
 * thanks to the response schema, it will not be sent to the client!"
 *
 * Cada campo do relatório Raio-X é tipado; campos não listados aqui
 * são filtrados pelo serializer (não vazam ao cliente).
 */
import { Type } from '@sinclair/typebox'

export const RaioXResponse = Type.Object(
  {
    retrato: Type.Object({
      frase: Type.String(),
      complemento: Type.Union([Type.String(), Type.Null()]),
    }),
    fatores: Type.Array(
      Type.Object({
        atributo: Type.String(),
        peso_percentual: Type.Integer(),
        descricao: Type.String(),
      }),
    ),
    estatisticas: Type.Object({
      total_clientes: Type.Integer(),
      ativos: Type.Integer(),
      com_recompra: Type.Integer(),
      percentual_fieis: Type.Integer(),
      ticket_medio: Type.Optional(Type.Number()),
      ticket_min: Type.Optional(Type.Number()),
      ticket_max: Type.Optional(Type.Number()),
    }),
    segmentos: Type.Array(
      Type.Object({
        segmento: Type.String(),
        quantidade: Type.Integer(),
        percentual: Type.Integer(),
      }),
    ),
    potencial: Type.Object({
      mensagem: Type.String(),
      cta: Type.String(),
    }),
  },
  {
    $id: 'schema:geolead:raio-x:response',
    additionalProperties: false,
  },
)
