import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AlertaService } from '../../src/services/alerta.service.js'
import {
  MemoryAlertaRepo,
  MemoryEntidadeAlvoRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'

function montarService() {
  const alertaRepo = new MemoryAlertaRepo()
  const perfilRepo = new MemoryPerfilRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo()
  const service = new AlertaService(alertaRepo, perfilRepo, entidadeRepo)
  return { service, alertaRepo, perfilRepo, entidadeRepo }
}

const now = new Date().toISOString()

test('escanear gera alertas para entidades no perfil', async () => {
  const { service, perfilRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510-8/01'], valorMax: ['5510-8/01'], peso: 0.6, tipoComparacao: 'enum' },
      { nome: 'porte', valorMin: 2, valorMax: 4, peso: 0.4, tipoComparacao: 'range' },
    ],
  })
  // MemoryEntidadeAlvoRepo já vem com entidades fixture (zona-sul)
  const resultado = await service.escanear('c1', 'zona-sul', 0.3)
  assert.ok(resultado.alertasGerados.length > 0, 'deve gerar ao menos 1 alerta')
  assert.equal(resultado.alertasGerados[0]!.status, 'novo')
  assert.equal(resultado.alertasGerados[0]!.clienteId, 'c1')
})

test('escanear é idempotente — não duplica alertas', async () => {
  const { service, perfilRepo } = montarService()
  await perfilRepo.salvar({
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510-8/01'], valorMax: ['5510-8/01'], peso: 1, tipoComparacao: 'enum' },
    ],
  })
  const r1 = await service.escanear('c1', 'zona-sul', 0.1)
  const r2 = await service.escanear('c1', 'zona-sul', 0.1)
  assert.equal(r2.alertasGerados.length, 0, 're-escanear não deve duplicar')
  // Mas os alertas originais devem existir via listar
  const todos = await service.listar('c1')
  assert.equal(todos.length, r1.alertasGerados.length)
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
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510-8/01'], valorMax: ['5510-8/01'], peso: 1, tipoComparacao: 'enum' },
    ],
  })
  const r = await service.escanear('c1', 'zona-sul', 0.1)
  const alerta = r.alertasGerados[0]!
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
