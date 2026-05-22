import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryCacheService } from '../../src/services/cache.service.js'

test('MemoryCacheService aplica cache-aside com remember', async () => {
  const cache = new MemoryCacheService(60)
  let calls = 0

  const first = await cache.remember('fonte:cnpj:joinville', async () => {
    calls++
    return { total: 3 }
  })
  const second = await cache.remember('fonte:cnpj:joinville', async () => {
    calls++
    return { total: 0 }
  })

  assert.deepEqual(first, { total: 3 })
  assert.deepEqual(second, { total: 3 })
  assert.equal(calls, 1)
})
