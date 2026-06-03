/**
 * Testes unitários do EnriquecimentoService (C2.2).
 *
 * 4 cenários que validam o contrato completo:
 *  1. Enriquece e descobre novos fatores via adapters
 *  2. Fallback parcial: fonte quebrada não derruba as demais
 *  3. Base inexistente → 404
 *  4. Poucos compradores → 422 (pré-condição CO2)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnriquecimentoService } from '../../src/services/enriquecimento.service.js'
import {
  MemoryBaseInternaRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import type { IAdaptadorFonte } from '../../src/adapters/base-adapter.js'

// ── Helpers ─────────────────────────────────────────────────

function fakeAdapter(
  nome: string,
  dados: Record<string, unknown>,
): { nome: string; adapter: IAdaptadorFonte } {
  return {
    nome,
    adapter: {
      nome,
      async consultar() { return [] },
      async enriquecer() {
        return { ...dados, fonte: nome, enriquecidoEm: new Date().toISOString() }
      },
    },
  }
}

function fakeAdapterQuebrado(nome: string): { nome: string; adapter: IAdaptadorFonte } {
  return {
    nome,
    adapter: {
      nome,
      async consultar() { return [] },
      async enriquecer() { throw new Error(`${nome} fora do ar`) },
    },
  }
}

async function baseComHoteis(clienteId = 'c1') {
  const baseRepo = new MemoryBaseInternaRepo()
  const perfilRepo = new MemoryPerfilRepo()
  await baseRepo.salvar({
    clienteId,
    periodo: '2024-12',
    totalRegistros: 3,
    compradores: [
      {
        identificador: 'hotel-1', nome: 'Hotel Bela Vista', tipo: 'pj',
        atributosOriginais: { cnae: '5510801', porte: 3 },
        ticketMedio: 12000, frequencia: 4, ativo: true,
      },
      {
        identificador: 'hotel-2', nome: 'Hotel Solar', tipo: 'pj',
        atributosOriginais: { cnae: '5510801', porte: 2 },
        ticketMedio: 8000, frequencia: 3, ativo: true,
      },
      {
        identificador: 'pousada-1', nome: 'Pousada do Mar', tipo: 'pj',
        atributosOriginais: { cnae: '5590699', porte: 4 },
        ticketMedio: 15000, frequencia: 5, ativo: true,
      },
    ],
  })
  return { baseRepo, perfilRepo }
}

// ── Testes ──────────────────────────────────────────────────

test('enriquecimento: descobre novos fatores via adapters (IBGE + Geocoder)', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()

  const fontes = [
    fakeAdapter('ibge-censo', { rendaMediaPc: 3500, idh: 0.78, populacao: 14000 }),
    fakeAdapter('geocoder', { bairro: 'Centro', municipio: 'Joinville', latitude: -26.3 }),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  // O perfil enriquecido deve ter MAIS fatores que o original
  assert.ok(
    resultado.perfilEnriquecido.totalFatores > resultado.perfilOriginal.totalFatores,
    `enriquecido (${resultado.perfilEnriquecido.totalFatores}) deve ter mais fatores que ` +
    `original (${resultado.perfilOriginal.totalFatores})`,
  )

  // Os novos fatores devem incluir atributos das fontes externas
  assert.ok(resultado.novosFatores.length > 0, 'deve ter novos fatores')
  const nomesNovos = resultado.novosFatores.map((f) => f.atributo)
  const temAlgumDoIBGE = nomesNovos.some((n) =>
    ['rendaMediaPc', 'idh', 'populacao'].includes(n),
  )
  assert.ok(temAlgumDoIBGE, 'deve incluir pelo menos um atributo do IBGE')

  // As duas fontes foram consultadas com sucesso
  assert.deepEqual(resultado.fontesConsultadas.sort(), ['geocoder', 'ibge-censo'])
  assert.deepEqual(resultado.fontesComFalha, [])
  assert.equal(resultado.compradoresEnriquecidos, 3)
})

test('enriquecimento: fallback parcial — fonte quebrada não derruba as demais', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()

  const fontes = [
    fakeAdapter('ibge-censo', { rendaMediaPc: 3500, idh: 0.78 }),
    fakeAdapterQuebrado('geocoder-quebrado'),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  // IBGE deve ter funcionado normalmente
  assert.ok(resultado.fontesConsultadas.includes('ibge-censo'), 'IBGE deve ter sido consultado')

  // Geocoder deve estar na lista de falhas
  assert.ok(
    resultado.fontesComFalha.includes('geocoder-quebrado'),
    'geocoder quebrado deve estar em fontesComFalha',
  )

  // Mesmo com falha parcial, novos fatores do IBGE devem existir
  assert.ok(resultado.novosFatores.length > 0, 'deve ter novos fatores mesmo com falha parcial')
})

test('enriquecimento: base inexistente retorna 404', async () => {
  const service = new EnriquecimentoService(
    new MemoryBaseInternaRepo(),
    new MemoryPerfilRepo(),
    [],
  )
  await assert.rejects(
    () => service.enriquecer('cliente-inexistente'),
    (err: { statusCode?: number; message?: string }) => {
      assert.equal(err.statusCode, 404)
      assert.ok(err.message?.includes('Base interna'))
      return true
    },
  )
})

test('enriquecimento: poucos compradores com recompra retorna 422 (CO2)', async () => {
  const baseRepo = new MemoryBaseInternaRepo()
  await baseRepo.salvar({
    clienteId: 'c1',
    periodo: '2024-12',
    totalRegistros: 2,
    compradores: [
      {
        identificador: 'h1', nome: 'Hotel Solo', tipo: 'pj',
        atributosOriginais: { cnae: '5510801' },
        ticketMedio: 10000, frequencia: 3, ativo: true,
      },
      {
        // Frequência 1 = sem recompra, não conta
        identificador: 'h2', nome: 'Hotel Unico', tipo: 'pj',
        atributosOriginais: { cnae: '5510801' },
        ticketMedio: 5000, frequencia: 1, ativo: true,
      },
    ],
  })

  const service = new EnriquecimentoService(
    baseRepo,
    new MemoryPerfilRepo(),
    [],
  )
  await assert.rejects(
    () => service.enriquecer('c1'),
    (err: { statusCode?: number; message?: string }) => {
      assert.equal(err.statusCode, 422)
      assert.ok(err.message?.includes('Mínimo de 3'))
      return true
    },
  )
})
