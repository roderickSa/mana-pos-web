export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

export function formatKg(grams: number): string {
  return `${(grams / 1000).toFixed(3)} kg`;
}

// Convierte lo tecleado en un input de soles a céntimos; null si no es válido.
export function solesInputToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}
