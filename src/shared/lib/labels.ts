// Etiquetas en humano compartidas por toda la app (una sola fuente de verdad).

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  card: 'Tarjeta',
  credit: 'Fiado',
};

// Del label táctil (español) al método que entiende la API.
export const CHARGE_METHOD_TO_API: Record<'Efectivo' | 'Yape' | 'Tarjeta', 'cash' | 'yape' | 'card'> = {
  Efectivo: 'cash',
  Yape: 'yape',
  Tarjeta: 'card',
};

export const MOVEMENT_KIND_LABELS: Record<string, string> = {
  sale: 'Venta',
  sale_reversal: 'Devolución',
  purchase: 'Entrada',
  waste: 'Merma',
  expiry: 'Caducidad',
  theft: 'Robo/pérdida',
  count: 'Conteo',
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

export function movementKindLabel(kind: string): string {
  return MOVEMENT_KIND_LABELS[kind] ?? kind;
}
