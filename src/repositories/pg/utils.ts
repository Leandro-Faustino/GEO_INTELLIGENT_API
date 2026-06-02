export function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
