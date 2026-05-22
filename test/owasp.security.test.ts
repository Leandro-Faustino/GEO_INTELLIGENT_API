import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../src/test-helper.js'

let app: FastifyInstance

before(async () => {
  app = await buildTestApp()
})

after(async () => {
  await app.close()
})

function forgeJwt(header: object, payload: object, signature: string): string {
  const b64 = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64(header)}.${b64(payload)}.${signature}`
}

describe('API1 BOLA - autorizacao no nivel de objeto', () => {
  test('usuario acessa o proprio documento (200)', async () => {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/documents/d1',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.match(res.json<{ content: string }>().content, /Alice/)
  })

  test('ATAQUE: Alice tenta acessar o documento do Bob trocando o ID (403)', async () => {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/documents/d2',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 403)
    assert.doesNotMatch(res.body, /Bob/)
  })
})

describe('API2 Broken Authentication - JWT', () => {
  test('ATAQUE alg:none - token sem assinatura e rejeitado (401)', async () => {
    const malicious = forgeJwt(
      { alg: 'none', typ: 'JWT' },
      { sub: 'u1', role: 'admin' },
      '',
    )
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${malicious}` },
    })

    assert.equal(res.statusCode, 401)
  })

  test('ATAQUE: token assinado com segredo errado e rejeitado (401)', async () => {
    const sig = createHmac('sha256', 'segredo-do-atacante')
      .update('forjado')
      .digest('base64url')
    const malicious = forgeJwt(
      { alg: 'HS256', typ: 'JWT' },
      { sub: 'u1', role: 'admin' },
      sig,
    )
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${malicious}` },
    })

    assert.equal(res.statusCode, 401)
  })

  test('rota protegida sem token retorna 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })

    assert.equal(res.statusCode, 401)
  })

  test('login com credenciais invalidas nao revela se o email existe', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'senha-errada' },
    })
    const r2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'naoexiste@example.com', password: 'qualquer' },
    })

    assert.equal(r1.statusCode, 401)
    assert.equal(r2.statusCode, 401)
    assert.equal(
      r1.json<{ message: string }>().message,
      r2.json<{ message: string }>().message,
    )
  })
})

describe('API3 BOPLA / Mass Assignment', () => {
  test('ATAQUE: injetar role=admin no login nao eleva privilegio', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'alice-secret-123',
        role: 'admin',
        isAdmin: true,
      },
    })

    assert.equal(res.statusCode, 200)
    const token = res.json<{ token: string }>().token
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(me.json<{ role: string }>().role, 'user')
  })
})

describe('API5 BFLA - RBAC por rota', () => {
  test('ATAQUE: usuario comum tenta acessar /admin/stats (403)', async () => {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 403)
  })

  test('admin acessa /admin/stats (200)', async () => {
    const token = await loginAs(app, 'root@example.com', 'admin-secret-789')
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
  })
})

describe('API7 SSRF - validacao de URL de saida', () => {
  const cases = [
    { url: 'http://169.254.169.254/latest/meta-data/', label: 'metadata cloud' },
    { url: 'http://127.0.0.1:8080/admin', label: 'loopback' },
    { url: 'http://localhost/internal', label: 'localhost' },
    { url: 'http://10.0.0.5/secret', label: 'rede privada 10/8' },
    { url: 'http://192.168.1.1/', label: 'rede privada 192.168' },
    { url: 'file:///etc/passwd', label: 'protocolo file' },
    { url: 'https://user:pass@evil.com/', label: 'credenciais embutidas' },
  ]

  for (const { url, label } of cases) {
    test(`ATAQUE bloqueado: ${label}`, async () => {
      const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
      const res = await app.inject({
        method: 'POST',
        url: '/fetch-remote',
        headers: { authorization: `Bearer ${token}` },
        payload: { url },
      })

      assert.equal(res.statusCode, 400)
    })
  }

  test('URL externa na allow-list e permitida (200)', async () => {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fetch-remote',
      headers: { authorization: `Bearer ${token}` },
      payload: { url: 'https://api.exemplo-confiavel.com/data' },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.json<{ allowed: boolean }>().allowed, true)
  })
})

describe('API8 Injection - NoSQL', () => {
  test('ATAQUE: payload {"$ne": null} no login e bloqueado (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: { $ne: null }, password: { $ne: null } },
    })

    assert.equal(res.statusCode, 400)
  })

  test('ATAQUE: operador $gt aninhado e bloqueado (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: { $gt: '' }, password: 'x' },
    })

    assert.equal(res.statusCode, 400)
  })
})

describe('API8 Security Misconfiguration - headers e erros', () => {
  test('resposta nao expoe X-Powered-By', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })

    assert.equal(res.headers['x-powered-by'], undefined)
  })

  test('headers de seguranca do Helmet estao presentes', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })

    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.ok(res.headers['x-frame-options'])
  })

  test('erro interno nao vaza stack trace ao cliente', async () => {
    const res = await app.inject({ method: 'GET', url: '/rota-inexistente' })

    assert.equal(res.statusCode, 404)
    assert.doesNotMatch(res.body, /at \/|node_modules|stack/i)
  })
})

describe('API4 Resource Consumption - rate limit no login', () => {
  test('ATAQUE: brute-force de login e bloqueado apos o limite (429)', async () => {
    const limited = await buildTestApp({ LOGIN_RATE_LIMIT_MAX: '3' })
    try {
      const codes: number[] = []
      for (let i = 0; i < 6; i += 1) {
        const res = await limited.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'alice@example.com', password: 'senha-errada' },
        })
        codes.push(res.statusCode)
      }

      assert.ok(codes.includes(429), `esperava 429 entre ${codes.join(',')}`)
    } finally {
      await limited.close()
    }
  })
})
