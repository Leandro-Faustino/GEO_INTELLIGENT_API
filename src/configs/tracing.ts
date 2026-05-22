import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

let sdk: NodeSDK | null = null

export function startTracing(): void {
  if (process.env['TRACING_ENABLED'] !== 'true') {
    return
  }

  const endpoint =
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    'http://localhost:4318/v1/traces'

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'geolead-api',
      [ATTR_SERVICE_VERSION]: '0.1.0',
      'deployment.environment': process.env['NODE_ENV'] ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()],
  })

  sdk.start()

  process.once('SIGTERM', () => {
    sdk?.shutdown().catch(() => {})
  })
}

export function getTracingSdk(): NodeSDK | null {
  return sdk
}
