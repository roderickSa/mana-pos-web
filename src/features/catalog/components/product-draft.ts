// La forma de lo que se guarda de un formulario de producto a medio llenar.
// Vive aparte del modal para poder validarla al leerla del navegador: un
// borrador de una versión anterior de la app no debe romper la pantalla.
//
// La imagen NO entra: una foto en base64 pesa más que todo lo demás junto y se
// vuelve a elegir en dos toques.
export interface ProductFormDraft {
  saleType: 'unit' | 'weight';
  name: string;
  category: string;
  barcode: string;
  shortCode: string;
  price: string;
  cost: string;
  minimum: string;
  initialStock: string;
  quickAccess: boolean;
  active: boolean;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function decodeProductDraft(data: unknown): ProductFormDraft | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  const saleType = raw.saleType === 'weight' ? 'weight' : raw.saleType === 'unit' ? 'unit' : undefined;
  const name = text(raw.name);
  const category = text(raw.category);
  const barcode = text(raw.barcode);
  const shortCode = text(raw.shortCode);
  const price = text(raw.price);
  const cost = text(raw.cost);
  const minimum = text(raw.minimum);
  const initialStock = text(raw.initialStock);
  if (
    saleType === undefined ||
    name === undefined ||
    category === undefined ||
    barcode === undefined ||
    shortCode === undefined ||
    price === undefined ||
    cost === undefined ||
    minimum === undefined ||
    initialStock === undefined ||
    typeof raw.quickAccess !== 'boolean' ||
    typeof raw.active !== 'boolean'
  ) {
    return undefined;
  }
  return {
    saleType,
    name,
    category,
    barcode,
    shortCode,
    price,
    cost,
    minimum,
    initialStock,
    quickAccess: raw.quickAccess,
    active: raw.active,
  };
}

export function sameDraft(a: ProductFormDraft, b: ProductFormDraft): boolean {
  return (
    a.saleType === b.saleType &&
    a.name === b.name &&
    a.category === b.category &&
    a.barcode === b.barcode &&
    a.shortCode === b.shortCode &&
    a.price === b.price &&
    a.cost === b.cost &&
    a.minimum === b.minimum &&
    a.initialStock === b.initialStock &&
    a.quickAccess === b.quickAccess &&
    a.active === b.active
  );
}
