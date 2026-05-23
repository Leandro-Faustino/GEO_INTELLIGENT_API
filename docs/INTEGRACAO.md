# Integração Gateway e Motor

O gateway Node.js e o motor Python se comunicam por HTTP síncrono. O gateway
continua dono dos dados, da autenticação, da validação e da persistência; o
motor processa inteligência de forma stateless.

## Componentes

- `src/adapters/motor.client.ts`: cliente HTTP resiliente para `/derivar`,
  `/analisar` e `/feedback`, reaproveitando `BaseAdapter`.
- `src/plugins/49-motor.ts`: injeta `fastify.motor` quando `MOTOR_URL` está
  configurada; com URL vazia, o gateway usa fallback local.
- `src/routes/analises/analises.routes.ts`: delega o lookalike ao motor quando
  disponível, traduz a resposta para o contrato do gateway e persiste a análise.

## Configuração

- `MOTOR_URL`: URL base do motor Python. Vazio desabilita a integração.
- `MOTOR_API_KEY`: chave interna enviada em `x-internal-key`.
- `MOTOR_TIMEOUT_MS`: timeout das chamadas ao motor.

## Resiliência

O `MotorClient` herda timeout, retry com backoff e circuit breaker do
`BaseAdapter`. Falhas de infraestrutura viram `MotorIndisponivelError`, e a
rota de análise cai para o service local.

## Observabilidade

O gateway propaga `x-request-id` para o motor. O mesmo ID aparece nos dois
serviços, permitindo rastrear a chamada cruzando a fronteira Node.js -> Python.
