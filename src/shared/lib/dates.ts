// Formatos de fecha/hora consistentes en toda la app (es-PE).

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// Fecha sola con año («01 ago. 2026»): vencimientos, respaldos, deudas —
// cosas donde el año sí importa.
export function formatDateOnly(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
