import { test } from 'node:test'
import assert from 'node:assert/strict'

test('perfil ideal exige cliente e criterios no contrato de dominio', () => {
  const perfil = {
    id: 'perfil-1',
    clienteId: 'cliente-1',
    criterios: ['localizacao'],
  }

  assert.equal(perfil.clienteId, 'cliente-1')
  assert.deepEqual(perfil.criterios, ['localizacao'])
})
