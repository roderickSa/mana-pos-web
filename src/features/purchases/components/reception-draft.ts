import type { ReceiveDraft } from './purchase-lines';

// Recibir una entrega es contar cajas con el repartidor esperando. Si la
// pantalla se recarga a mitad —o alguien toca F5 sin querer— lo tecleado
// vuelve, y sobre todo vuelve el MISMO `receptionId`.
//
// Ese id es lo que hace que reintentar no duplique stock: el servidor trata
// una segunda llamada con el mismo id como repetición, no como una entrega
// más. Si al reintentar se generara uno nuevo, la mercadería entraría dos
// veces y el inventario quedaría inflado sin que nadie se entere.

export interface ReceptionDraft {
  receptionId: string;
  documentNumber: string;
  paymentTerms: string;
  // lineId → lo tecleado en esa línea.
  lines: Record<string, ReceiveDraft>;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function decodeLine(data: unknown): ReceiveDraft | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  const quantity = text(raw.quantity);
  const cost = text(raw.cost);
  const expiry = text(raw.expiry);
  if (quantity === undefined || cost === undefined || expiry === undefined) return undefined;
  return { quantity, cost, expiry };
}

export function decodeReceptionDraft(data: unknown): ReceptionDraft | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  const receptionId = text(raw.receptionId);
  const documentNumber = text(raw.documentNumber);
  const paymentTerms = text(raw.paymentTerms);
  if (receptionId === undefined || documentNumber === undefined || paymentTerms === undefined) {
    return undefined;
  }
  if (typeof raw.lines !== 'object' || raw.lines === null) return undefined;
  const lines: Record<string, ReceiveDraft> = {};
  for (const [lineId, value] of Object.entries(raw.lines)) {
    const line = decodeLine(value);
    if (line === undefined) return undefined;
    lines[lineId] = line;
  }
  return { receptionId, documentNumber, paymentTerms, lines };
}

export function receptionDraftOf(
  receptionId: string,
  documentNumber: string,
  paymentTerms: string,
  lines: ReadonlyMap<string, ReceiveDraft>,
): ReceptionDraft {
  return {
    receptionId,
    documentNumber,
    paymentTerms,
    lines: Object.fromEntries(lines),
  };
}

export function linesOfReceptionDraft(draft: ReceptionDraft): Map<string, ReceiveDraft> {
  return new Map(Object.entries(draft.lines));
}
