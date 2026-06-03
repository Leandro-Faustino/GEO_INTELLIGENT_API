import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DerivacaoService } from '../../src/services/derivacao.service.js'
import {
  MemoryBaseInternaRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import type { BaseInternaDTO } from '../../src/repositories/interfaces/index.js'

function baseComCompradores(
  clienteId: string,
  compradores: Array<{
    freq: number
    ativo: boolean
    ticket?: number
    cnae?: string
  }>,
): BaseInternaDTO {
  return {
    clienteId,
    periodo: '2026-05',
    totalRegistros: compradores.length,
    compradores: compradores.map((comprador, index) => ({
      identificador: `comp-${index}`,
      nome: `Comprador ${index}`,
      tipo: 'pj',
      atributosOriginais: {
        cnae: comprador.cnae ?? '5510801',
        porte: 3,
      },
      ticketMedio: comprador.ticket ?? 10_000,
      frequencia: comprador.freq,
      ativo: comprador.ativo,
    })),
  }
}

describe('DerivacaoService', () => {
  test('deriva perfil com 3+ compradores válidos e persiste no repositório', async () => {
    const baseRepo = new MemoryBaseInternaRepo()
    const perfilRepo = new MemoryPerfilRepo()
    await baseRepo.salvar(
      baseComCompradores('c1', [
        { freq: 3, ativo: true },
        { freq: 4, ativo: true },
        { freq: 2, ativo: true },
      ]),
    )

    const service = new DerivacaoService(baseRepo, perfilRepo)
    const perfil = await service.derivarPerfil('c1', 'pj')

    assert.equal(perfil.clienteId, 'c1')
    assert.equal(perfil.tipo, 'pj')
    assert.equal(perfil.hipotetico, false)
    assert.ok(perfil.criterios.length > 0)
    assert.equal((await perfilRepo.buscarPorCliente('c1')).length, 1)
  })

  test('rejeita base inexistente com 404', async () => {
    const service = new DerivacaoService(
      new MemoryBaseInternaRepo(),
      new MemoryPerfilRepo(),
    )

    await assert.rejects(
      () => service.derivarPerfil('inexistente', 'pj'),
      (error: { statusCode?: number }) => error.statusCode === 404,
    )
  })

  test('rejeita menos de 3 compradores com recompra CO2 com 422', async () => {
    const baseRepo = new MemoryBaseInternaRepo()
    await baseRepo.salvar(
      baseComCompradores('c1', [
        { freq: 3, ativo: true },
        { freq: 1, ativo: true },
        { freq: 2, ativo: false },
      ]),
    )

    const service = new DerivacaoService(baseRepo, new MemoryPerfilRepo())

    await assert.rejects(
      () => service.derivarPerfil('c1', 'pj'),
      (error: { statusCode?: number }) => error.statusCode === 422,
    )
  })

  test('inclui critério de ticket médio quando há valores', async () => {
    const baseRepo = new MemoryBaseInternaRepo()
    await baseRepo.salvar(
      baseComCompradores('c1', [
        { freq: 3, ativo: true, ticket: 10_000 },
        { freq: 4, ativo: true, ticket: 12_000 },
        { freq: 2, ativo: true, ticket: 8_000 },
      ]),
    )

    const perfil = await new DerivacaoService(
      baseRepo,
      new MemoryPerfilRepo(),
    ).derivarPerfil('c1', 'pj')

    const criterioTicket = perfil.criterios.find(
      (criterio) => criterio.nome === 'ticketMedio',
    )
    assert.ok(criterioTicket)
    assert.equal(criterioTicket.tipoComparacao, 'range')
    assert.ok(Number(criterioTicket.valorMin) <= 8_000)
    assert.ok(Number(criterioTicket.valorMax) >= 12_000)
  })

  test('CNAE consistente vira critério enum, não média numérica', async () => {
    const baseRepo = new MemoryBaseInternaRepo()
    await baseRepo.salvar(
      baseComCompradores('c1', [
        { freq: 3, ativo: true, cnae: '5510801' },
        { freq: 4, ativo: true, cnae: '5510801' },
        { freq: 2, ativo: true, cnae: '5510801' },
      ]),
    )

    const perfil = await new DerivacaoService(
      baseRepo,
      new MemoryPerfilRepo(),
    ).derivarPerfil('c1', 'pj')

    const criterioCnae = perfil.criterios.find((criterio) => criterio.nome === 'cnae')
    assert.ok(criterioCnae)
    assert.equal(criterioCnae.tipoComparacao, 'enum')
    assert.deepEqual(criterioCnae.valorMin, ['5510801'])
  })
})
