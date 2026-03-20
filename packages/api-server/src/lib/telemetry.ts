import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { log } from './logger.js'

let sdk: NodeSDK | null = null

export function initTelemetry(): void {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

  if (!otlpEndpoint) {
    log.telemetry.info('OTEL_EXPORTER_OTLP_ENDPOINT not set, telemetry disabled')
    return
  }

  try {
    const exporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    })

    sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: 'api-server',
        [ATTR_SERVICE_VERSION]: '0.1.0',
      }),
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable fs instrumentation to reduce noise
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    })

    sdk.start()
    log.telemetry.info('OpenTelemetry initialized', { endpoint: otlpEndpoint })

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk?.shutdown().catch((err) => log.telemetry.error('shutdown failed', { err }))
    })
  } catch (err) {
    log.telemetry.warn('Failed to initialize OpenTelemetry', { err })
  }
}
