export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

export function formatKg(grams: number): string {
  return `${(grams / 1000).toFixed(3)} kg`;
}

// Valor inicial para un input de soles a partir de céntimos.
export function centsToSolesInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Convierte lo tecleado en un input de soles a céntimos; null si no es válido.
export function solesInputToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

// El efectivo peruano no baja de 10 céntimos: lo que se cobra o paga en
// físico va en pasos de S/ 0.10.
export function roundToDimeCents(cents: number): number {
  return Math.round(cents / 10) * 10;
}

export function isDimeCents(cents: number): boolean {
  return cents % 10 === 0;
}

export const DIME_MESSAGE = 'Los montos van en pasos de 10 céntimos (S/ 0.10).';
