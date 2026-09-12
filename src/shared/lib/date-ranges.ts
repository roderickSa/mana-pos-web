// Rangos rápidos compartidos por Historial y Reportes: días locales.
export type QuickRange = 'hoy' | 'ayer' | 'semana' | 'mes';

export function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function quickRange(kind: QuickRange, now = new Date()): { from: string; to: string } {
  const today = toLocalIsoDate(now);
  if (kind === 'hoy') return { from: today, to: today };
  if (kind === 'ayer') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const value = toLocalIsoDate(yesterday);
    return { from: value, to: value };
  }
  if (kind === 'semana') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: toLocalIsoDate(start), to: today };
  }
  return { from: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
}

export const QUICK_RANGE_LABELS: Record<QuickRange, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  semana: '7 días',
  mes: 'Este mes',
};
