// La forma de lo que se guarda de unas condiciones de proveedor a medio
// llenar. Vive aparte del modal para poder validarla al leerla del navegador:
// un borrador de una versión anterior de la app no debe romper la pantalla.
export interface SupplyFormDraft {
  cost: string;
  presentation: string;
  packQuantity: string;
  packCost: string;
  sku: string;
  preferred: boolean;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function decodeSupplyDraft(data: unknown): SupplyFormDraft | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  const cost = text(raw.cost);
  const presentation = text(raw.presentation);
  const packQuantity = text(raw.packQuantity);
  const packCost = text(raw.packCost);
  const sku = text(raw.sku);
  if (
    cost === undefined ||
    presentation === undefined ||
    packQuantity === undefined ||
    packCost === undefined ||
    sku === undefined ||
    typeof raw.preferred !== 'boolean'
  ) {
    return undefined;
  }
  return { cost, presentation, packQuantity, packCost, sku, preferred: raw.preferred };
}

export function sameSupplyDraft(a: SupplyFormDraft, b: SupplyFormDraft): boolean {
  return (
    a.cost === b.cost &&
    a.presentation === b.presentation &&
    a.packQuantity === b.packQuantity &&
    a.packCost === b.packCost &&
    a.sku === b.sku &&
    a.preferred === b.preferred
  );
}
