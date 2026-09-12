interface ProductBase {
  id: string;
  barcode: string | null;
  shortCode: string | null;
  name: string;
  category: string;
  // Proveedores a los que se compra; vacío = costo directo sin proveedor.
  supplierIds: string[];
  imagePath: string | null;
  active: boolean;
  quickAccess: boolean;
}

export interface SupplierDto {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  visitDays: string[];
  contactName: string | null;
  paymentTerms: string | null;
  active: boolean;
}

export interface UnitProductDto extends ProductBase {
  saleType: 'unit';
  priceCents: number;
  costCents: number;
  // Compra por empaque: 1 caja/paquete = packSize unidades a packCostCents.
  packSize: number | null;
  packCostCents: number | null;
  stockUnits: number;
  stockMinimum: number;
}

export interface WeightProductDto extends ProductBase {
  saleType: 'weight';
  pricePerKgCents: number;
  costPerKgCents: number;
  stockGrams: number;
  stockMinimumGrams: number;
}

export type ProductDto = UnitProductDto | WeightProductDto;

interface TicketLineBase {
  lineId: string;
  // Descuento de la línea en céntimos; totalCents ya lo tiene restado.
  discountCents: number;
  totalCents: number;
}

export interface UnitTicketLine extends TicketLineBase {
  kind: 'unit';
  product: UnitProductDto;
  quantity: number;
}

export interface WeightTicketLine extends TicketLineBase {
  kind: 'weight';
  product: WeightProductDto;
  grams: number;
  weightSource: 'scale' | 'manual';
}

// Una línea es de unidades o de peso: cada una trae solo lo suyo (antes
// `weightGrams: null` en las de unidad obligaba a `?? 0` por todos lados).
export type TicketLine = UnitTicketLine | WeightTicketLine;
