import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MemoryAlertaRepo,
  MemoryBaseInternaRepo,
  MemoryEntidadeAlvoRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import { AlertaService } from '../../src/services/alerta.service.js'

function montarService() {
  const alertaRepo = new MemoryAlertaRepo()
  const perfilRepo = new MemoryPerfilRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo()
  const baseInternaRepo = new MemoryBaseInternaRepo()
  const service = new AlertaService(
    alertaRepo,
    perfilRepo,
    entidadeRepo,
    baseInternaRepo,
  )
  return { service, perfilRepo, baseInternaRepo }
}

const now = new Date().toISOString()

test('escanear gera alertas para entidades no perfil', async () => {
  const { service, perfilRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1',
    clienteId: 'c1',
    nome: 'Hotel',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: [],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510-8/01'],
        valorMax: ['5510-8/01'],
        peso: 0.6,
        tipoComparacao: 'enum',
      },
      {
        nome: 'porte',
        valorMin: 2,
        valorMax: 4,
        peso: 0.4,
        tipoComparacao: 'range',
      },
    ],
  })

  const resultado = await service.escanear('c1', 'zona-sul', 0.3)
  assert.ok(resultado.alertasGerados.length > 0)
  assert.equal(resultado.alertasGerados[0]?.status, 'novo')
  assert.equal(resultado.alertasGerados[0]?.clienteId, 'c1')
})

test('escanear é idempotente e não duplica alertas', async () => {
  const { service, perfilRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1',
    clienteId: 'c1',
    nome: 'Hotel',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: [],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510-8/01'],
        valorMax: ['5510-8/01'],
        peso: 1,
        tipoComparacao: 'enum',
      },
    ],
  })

  const primeiraExecucao = await service.escanear('c1', 'zona-sul', 0.1)
  const segundaExecucao = await service.escanear('c1', 'zona-sul', 0.1)
  const todos = await service.listar('c1')

  assert.equal(segundaExecucao.alertasGerados.length, 0)
  assert.equal(todos.length, primeiraExecucao.alertasGerados.length)
})

test('escanear ignora entidades que já são clientes', async () => {
  const { service, perfilRepo, baseInternaRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1',
    clienteId: 'c1',
    nome: 'Hotel',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: [],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510-8/01'],
        valorMax: ['5510-8/01'],
        peso: 1,
        tipoComparacao: 'enum',
      },
    ],
  })
  await baseInternaRepo.salvar({
    clienteId: 'c1',
    periodo: '2026-05',
    totalRegistros: 1,
    compradores: [
      {
        identificador: 'hotel-panorama',
        nome: 'Hotel Panorama',
        tipo: 'pj',
        atributosOriginais: {},
        ticketMedio: 100,
        frequencia: 2,
        ativo: true,
      },
    ],
  })

  const resultado = await service.escanear('c1', 'zona-sul', 0.1)
  assert.equal(
    resultado.alertasGerados.some(
      (alerta) => alerta.entidadeAlvoId === 'hotel-panorama',
    ),
    false,
  )
})

test('escanear respeita exclusões do perfil', async () => {
  const { service, perfilRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1',
    clienteId: 'c1',
    nome: 'Hotel',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: ['hotel-panorama'],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510-8/01'],
        valorMax: ['5510-8/01'],
        peso: 1,
        tipoComparacao: 'enum',
      },
    ],
  })

  const resultado = await service.escanear('c1', 'zona-sul', 0.1)
  assert.equal(
    resultado.alertasGerados.some(
      (alerta) => alerta.entidadeAlvoId === 'hotel-panorama',
    ),
    false,
  )
})

test('escanear sem perfil lança 404', async () => {
  const { service } = montarService()
  await assert.rejects(
    () => service.escanear('sem-perfil', 'zona-sul'),
    (err: { statusCode?: number }) => err.statusCode === 404,
  )
})

test('atualizarStatus muda o status do alerta', async () => {
  const { service, perfilRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1',
    clienteId: 'c1',
    nome: 'Hotel',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: [],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510-8/01'],
        valorMax: ['5510-8/01'],
        peso: 1,
        tipoComparacao: 'enum',
      },
    ],
  })

  const resultado = await service.escanear('c1', 'zona-sul', 0.1)
  const alerta = resultado.alertasGerados[0]
  assert.ok(alerta)

  const atualizado = await service.atualizarStatus(alerta.id, 'convertido')
  assert.equal(atualizado.status, 'convertido')
})

test('atualizarStatus com id inexistente lança 404', async () => {
  const { service } = montarService()
  await assert.rejects(
    () => service.atualizarStatus('inexistente', 'visto'),
    (err: { statusCode?: number }) => err.statusCode === 404,
  )
})
