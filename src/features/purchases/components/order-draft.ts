import type { ProductDto } from '@/shared/types';
import type { DraftLine } from './purchase-lines';

// Armar una orden de compra es el formulario más largo de la app: se hace
// caminando el depósito, con el proveedor al teléfono, y puede llevar media
// hora. Lo que se teclea vive en ESTE navegador hasta que alguien crea la
// orden: hasta entonces no le importa a nadie más, y guardarla en el servidor
// traía una cola de borradores que nadie podía limpiar. Lo que sigue es la
// forma de ese apunte, acá para poder probarla sin navegador.

// --- Lo que se guarda en el navegador -----------------------------------
//
// De cada línea se guardan solo los datos tecleados, no el producto entero:
// el producto se vuelve a pedir al restaurar, así el nombre, el stock y el
// precio salen del catálogo de ahora y no de una foto vieja.

export interface StoredDraftLine {
  productId: string;
  quantity: string;
  cost: string;
  packSize: number | null;
}

export interface OrderDraftSnapshot {
  supplierId: string;
  notes: string;
  expectedAt: string;
  headerOpen: boolean;
  lines: readonly StoredDraftLine[];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function decodeLine(data: unknown): StoredDraftLine | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  const productId = text(raw.productId);
  const quantity = text(raw.quantity);
  const cost = text(raw.cost);
  if (productId === undefined || quantity === undefined || cost === undefined) return undefined;
  const packSize = raw.packSize;
  if (packSize !== null && typeof packSize !== 'number') return undefined;
  return { productId, quantity, cost, packSize };
}

export function decodeOrderDraft(data: unknown): OrderDraftSnapshot | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  const supplierId = text(raw.supplierId);
  const notes = text(raw.notes);
  const expectedAt = text(raw.expectedAt);
  if (supplierId === undefined || notes === undefined || expectedAt === undefined) return undefined;
  if (typeof raw.headerOpen !== 'boolean') return undefined;
  if (!Array.isArray(raw.lines)) return undefined;
  const lines: StoredDraftLine[] = [];
  for (const item of raw.lines) {
    const line = decodeLine(item);
    if (line === undefined) return undefined;
    lines.push(line);
  }
  return {
    supplierId,
    notes,
    expectedAt,
    headerOpen: raw.headerOpen,
    lines,
  };
}

// La vuelta: lo que se escribe en el navegador es JSON pelado.
export function encodeOrderDraft(snapshot: OrderDraftSnapshot): unknown {
  return {
    supplierId: snapshot.supplierId,
    notes: snapshot.notes,
    expectedAt: snapshot.expectedAt,
    headerOpen: snapshot.headerOpen,
    lines: snapshot.lines.map((line) => ({ ...line })),
  };
}

export function storedLines(lines: readonly DraftLine[]): StoredDraftLine[] {
  return lines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    cost: line.cost,
    packSize: line.packSize,
  }));
}

// Un producto que ya no está (lo borraron, se fusionó) no puede frenar la
// restauración del resto: se cuenta aparte para avisarlo.
export function restoreLines(
  stored: readonly StoredDraftLine[],
  products: ReadonlyMap<string, ProductDto>,
): { lines: DraftLine[]; missing: number } {
  const lines: DraftLine[] = [];
  let missing = 0;
  for (const line of stored) {
    const product = products.get(line.productId);
    if (product === undefined) {
      missing += 1;
      continue;
    }
    lines.push({ product, quantity: line.quantity, cost: line.cost, packSize: line.packSize });
  }
  return { lines, missing };
}

// Un borrador vacío no se guarda: sin proveedor, sin líneas y sin nada escrito
// no hay nada que recuperar.
export function isEmptyOrderDraft(snapshot: OrderDraftSnapshot): boolean {
  return (
    snapshot.supplierId === '' &&
    snapshot.notes.trim() === '' &&
    snapshot.expectedAt === '' &&
    snapshot.lines.length === 0
  );
}

// --- La fecha de entrega ------------------------------------------------
//
// El servidor DEVUELVE la fecha con hora (`2026-09-25T17:00:00.000Z`) y solo
// ACEPTA el día (`2026-09-25`). Sin esta vuelta, editar un borrador traído del
// servidor devolvía 400 en cada cambio y el pie se quedaba en «sin guardar».
export function deliveryDay(iso: string | null): string {
  if (iso === null || iso === '') return '';
  // Ya es un día pelado: no pasa por Date, que lo leería como medianoche UTC
  // y en Lima lo correría al día anterior.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
