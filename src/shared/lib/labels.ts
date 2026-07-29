// Etiquetas en humano compartidas por toda la app (una sola fuente de verdad).

export const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  card: 'Tarjeta',
  credit: 'Fiado',
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
