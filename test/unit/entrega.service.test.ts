import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EntregaService } from '../../src/services/entrega.service.js'
import {
  MemoryAnaliseRepo,
  MemoryEntregaRepo,
  MemoryFeedbackRepo,
} from '../../src/repositories/memory/index.js'

test('entrega service monta entrega a partir de uma analise existente', async () => {
  const analiseRepo = new MemoryAnaliseRepo()
  const entregaRepo = new MemoryEntregaRepo()
  const feedbackRepo = new MemoryFeedbackRepo()
  const service = new EntregaService(entregaRepo, feedbackRepo, analiseRepo)

  await analiseRepo.salvar({
    id: 'analise-1',
    clienteId: 'cliente-1',
    tipo: 'pj',
    escopo: 'zona-sul',
    versaoModelo: '0.1.0',
    oportunidades: [
      {
        id: 'op-1',
        entidadeAlvoId: 'entidade-1',
        tipo: 'pj',
        justificativa: 'aderente',
        ganchoAbordagem: 'gancho',
        prioridade: 'alta',
        score: { valor: 0.9, similaridade: 0.8, probConversao: 0.95 },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const entrega = await service.montarEntrega(
    'cliente-1',
    'analise-1',
    '2026-05',
    'planilha',
  )

  assert.equal(entrega.clienteId, 'cliente-1')
  assert.equal(entrega.analiseId, 'analise-1')
  assert.equal(entrega.totalOportunidades, 1)
})

test('entrega service registra feedback associado a uma entrega existente', async () => {
  const analiseRepo = new MemoryAnaliseRepo()
  const entregaRepo = new MemoryEntregaRepo()
  const feedbackRepo = new MemoryFeedbackRepo()
  const service = new EntregaService(entregaRepo, feedbackRepo, analiseRepo)

  await analiseRepo.salvar({
    id: 'analise-1',
    clienteId: 'cliente-1',
    tipo: 'pj',
    escopo: 'zona-sul',
    versaoModelo: '0.1.0',
    oportunidades: [
      {
        id: 'op-1',
        entidadeAlvoId: 'entidade-1',
        tipo: 'pj',
        justificativa: 'aderente',
        ganchoAbordagem: 'gancho',
        prioridade: 'alta',
        score: { valor: 0.9, similaridade: 0.8, probConversao: 0.95 },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  await entregaRepo.salvar({
    id: 'entrega-1',
    clienteId: 'cliente-1',
    analiseId: 'analise-1',
    tipo: 'pj',
    periodo: '2026-05',
    formato: 'planilha',
    totalOportunidades: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  const feedback = await service.registrarFeedback('entrega-1', {
    observacoes: 'lead convertido',
    resultados: [{ entidadeAlvoId: 'entidade-1', converteu: true, ticketReal: 500 }],
  })

  assert.equal(feedback.entregaId, 'entrega-1')
  assert.equal(feedback.resultados.length, 1)
  assert.equal(feedback.resultados[0]?.atributos['prioridade'], 'alta')
})
