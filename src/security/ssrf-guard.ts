const PRIVATE_IPV4_RANGES: Array<(octets: number[]) => boolean> = [
  (octets) => octets[0] === 10,
  (octets) => octets[0] === 127,
  (octets) => octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31,
  (octets) => octets[0] === 192 && octets[1] === 168,
  (octets) => octets[0] === 169 && octets[1] === 254,
  (octets) => octets[0] === 0,
]

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false

  const octets = parts.map((part) => Number(part))
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false
  }

  return PRIVATE_IPV4_RANGES.some((inRange) => inRange(octets))
}

export interface SsrfGuardOptions {
  allowedHosts?: string[]
  allowedProtocols?: string[]
  allowedPorts?: number[]
}

export interface SsrfValidationResult {
  ok: boolean
  reason?: string
  url?: URL
}

export function validateOutboundUrl(
  raw: string,
  options: SsrfGuardOptions = {},
): SsrfValidationResult {
  const {
    allowedHosts = [],
    allowedProtocols = ['https:'],
    allowedPorts = [443],
  } = options

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'URL malformada.' }
  }

  if (!allowedProtocols.includes(url.protocol)) {
    return { ok: false, reason: `Protocolo não permitido: ${url.protocol}` }
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'Credenciais embutidas na URL.' }
  }

  const host = url.hostname.toLowerCase()

  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local')) {
    return { ok: false, reason: 'Host interno bloqueado.' }
  }

  if (isPrivateIpv4(host)) {
    return { ok: false, reason: 'Endereço IP interno bloqueado.' }
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return { ok: false, reason: 'Host fora da allow-list.' }
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!allowedPorts.includes(port)) {
    return { ok: false, reason: `Porta não permitida: ${port}` }
  }

  return { ok: true, url }
}
