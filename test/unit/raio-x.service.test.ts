import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRaioXLocal } from '../../src/services/raio-x.service.js'

function comprador(
  id: string,
  cidade: string,
  porte: string,
  ticket: number,
  frequencia: number,
  ativo: boolean,
) {
  return {
    identificador: id,
    nome: `Empresa ${id}`,
    tipo: 'pj',
    atributosOriginais: { cidade, porte, cnae: '5510801' },
    ticketMedio: ticket,
    frequencia,
    ativo,
  }
}

const baseTeste = [
  comprador('c1', 'São Paulo', 'medio', 1200, 3, true),
  comprador('c2', 'São Paulo', 'medio', 1500, 2, true),
  comprador('c3', 'Campinas', 'pequeno', 800, 2, true),
  comprador('c4', 'Curitiba', 'grande', 3000, 1, true),
  comprador('c5', 'Curitiba', 'medio', 600, 0, false),
]

describe('calcularRaioXLocal', () => {
  test('retorna estrutura completa para base válida', () => {
    const result = calcularRaioXLocal(baseTeste)

    assert.ok('retrato' in result)
    assert.ok('fatores' in result)
    assert.ok('estatisticas' in result)
    assert.ok('segmentos' in result)
    assert.ok('potencial' in result)
  })

  test('estatísticas corretas — total, ativos, recompra, ticket', () => {
    const result = calcularRaioXLocal(baseTeste)
    const { estatisticas } = result

    assert.equal(estatisticas.totalClientes, 5)
    assert.equal(estatisticas.ativos, 4)
    assert.equal(estatisticas.comRecompra, 3) // freq >= 2: c1, c2, c3
    assert.equal(estatisticas.percentualFieis, 60) // 3/5 = 60%
    assert.ok(typeof estatisticas.ticketMedio === 'number')
    assert.ok(typeof estatisticas.ticketMin === 'number')
    assert.ok(typeof estatisticas.ticketMax === 'number')
    assert.equal(estatisticas.ticketMin, 600)
    assert.equal(estatisticas.ticketMax, 3000)
  })

  test('fatores derivados dos atributosOriginais', () => {
    const result = calcularRaioXLocal(baseTeste)

    assert.ok(result.fatores.length > 0)
    for (const fator of result.fatores) {
      assert.ok(typeof fator.atributo === 'string')
      assert.ok(typeof fator.pesoPercentual === 'number')
      assert.ok(typeof fator.descricao === 'string')
    }
    // soma dos pesoPercentual deve ser ~100
    const soma = result.fatores.reduce((s, f) => s + f.pesoPercentual, 0)
    assert.ok(soma >= 95 && soma <= 105, `soma dos pesos foi ${soma}`)
  })

  test('segmentos agrupam por atributo de maior cardinalidade moderada', () => {
    const result = calcularRaioXLocal(baseTeste)

    assert.ok(result.segmentos.length >= 2)
    for (const seg of result.segmentos) {
      assert.ok(typeof seg.segmento === 'string')
      assert.ok(typeof seg.quantidade === 'number')
      assert.ok(typeof seg.percentual === 'number')
    }
  })

  test('retrato tem frase não vazia', () => {
    const result = calcularRaioXLocal(baseTeste)
    assert.ok(result.retrato.frase.length > 10)
  })

  test('potencial tem mensagem e cta', () => {
    const result = calcularRaioXLocal(baseTeste)
    assert.ok(result.potencial.mensagem.length > 0)
    assert.ok(result.potencial.cta.length > 0)
  })

  test('lança 422 com menos de 3 compradores', () => {
    assert.throws(
      () => calcularRaioXLocal([baseTeste[0]!, baseTeste[1]!]),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal((err as { statusCode?: number }).statusCode, 422)
        return true
      },
    )
  })

  test('compradores sem atributosOriginais não travam', () => {
    const semAtributos = [
      { identificador: 'x1', nome: 'A', tipo: 'pj', atributosOriginais: {}, ticketMedio: 500, frequencia: 2, ativo: true },
      { identificador: 'x2', nome: 'B', tipo: 'pj', atributosOriginais: {}, ticketMedio: 600, frequencia: 1, ativo: true },
      { identificador: 'x3', nome: 'C', tipo: 'pj', atributosOriginais: {}, ticketMedio: 400, frequencia: 0, ativo: false },
    ]
    const result = calcularRaioXLocal(semAtributos)
    assert.equal(result.estatisticas.totalClientes, 3)
    assert.deepEqual(result.fatores, [])
    assert.deepEqual(result.segmentos, [])
  })

  test('fidelização alta produz mensagem de expansão', () => {
    const baseAlta = [
      comprador('a1', 'SP', 'medio', 1000, 3, true),
      comprador('a2', 'SP', 'medio', 1200, 2, true),
      comprador('a3', 'RJ', 'medio', 900, 2, true),
      comprador('a4', 'RJ', 'grande', 2000, 3, true),
      comprador('a5', 'SP', 'medio', 800, 2, true),
    ]
    const result = calcularRaioXLocal(baseAlta)
    assert.ok(
      result.potencial.mensagem.toLowerCase().includes('expansão') ||
      result.potencial.mensagem.toLowerCase().includes('expans'),
    )
  })
})
