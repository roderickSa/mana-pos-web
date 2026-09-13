import { getJson, sendJson } from '@/shared/api/client';

export type PurchaseOrderStatus =
  | 'draft'
  | 'open'
  | 'partial'
  | 'received'
  | 'cancelled'
  | 'closed';

export interface PurchaseOrderSummaryDto {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  linesCount: number;
  totalCents: number;
  expectedAt: string | null;
  createdAt: string;
}

export interface PurchaseOrderLineDto {
  id: string;
  productId: string;
  description: string;
  saleType: 'unit' | 'weight';
  quantityOrdered: number;
  quantityReceived: number;
  pendingQuantity: number;
  unitCostCents: number;
  packSize: number | null;
  packCostCents: number | null;
  totalCents: number;
}

export interface PurchaseReceptionLineDto {
  productId: string;
  quantity: number;
  unitCostCents: number;
  expiryDate: string | null;
}

// Una tanda de recepción: la orden trae el acumulado; esto, la historia.
export interface PurchaseReceptionDto {
  id: string;
  receivedAt: string;
  receivedBy: string;
  // Factura o guía con la que llegó, y cómo se pagó esa entrega.
  documentNumber: string | null;
  paymentTerms: string | null;
  lines: PurchaseReceptionLineDto[];
}

export interface PurchaseOrderDto {
  id: string;
  number: number;
  supplierId: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  expectedAt: string | null;
  closedReason: string | null;
  createdBy: string;
  createdAt: string;
  totalCents: number;
  // Lo que falta traer, valorizado al costo pactado.
  pendingCents: number;
  lines: PurchaseOrderLineDto[];
  receptions: PurchaseReceptionDto[];
}

export interface CreateOrderLinePayload {
  productId: string;
  // Unidades para productos por unidad, gramos para pesables.
  quantity: number;
  // Costo pactado por unidad o por kg.
  unitCostCents: number;
  packSize: number | null;
  packCostCents: number | null;
}

export interface PurchaseOrdersPageDto {
  items: PurchaseOrderSummaryDto[];
  total: number;
  page: number;
  perPage: number;
}

// `pending`: solo las que todavía deben mercadería (abiertas o parciales). Sin
// esto, quien busca la orden de un producto tendría que recorrer las páginas.
export async function listPurchaseOrders(
  page: number,
  perPage: number,
  pending = false,
): Promise<PurchaseOrdersPageDto> {
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
  if (pending) params.set('pending', 'true');
  return getJson(`/purchases/orders?${params.toString()}`);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDto> {
  return getJson(`/purchases/orders/${id}`);
}

export async function createPurchaseOrder(
  supplierId: string,
  notes: string | null,
  expectedAt: string | null,
  asDraft: boolean,
  lines: CreateOrderLinePayload[],
): Promise<PurchaseOrderDto> {
  return sendJson('POST', '/purchases/orders', {
    supplierId,
    notes,
    expectedAt,
    asDraft,
    lines,
  });
}

export async function editPurchaseOrder(
  id: string,
  notes: string | null,
  expectedAt: string | null,
  lines: CreateOrderLinePayload[],
): Promise<PurchaseOrderDto> {
  return sendJson('PUT', `/purchases/orders/${id}`, { notes, expectedAt, lines });
}

export async function confirmPurchaseOrder(id: string): Promise<PurchaseOrderDto> {
  return sendJson('POST', `/purchases/orders/${id}/confirm`);
}

export async function closePurchaseOrderEarly(
  id: string,
  reason: string,
): Promise<PurchaseOrderDto> {
  return sendJson('POST', `/purchases/orders/${id}/close`, { reason });
}

// Con qué llega uno a armarle una orden: cuánto se le suele gastar y qué fue
// lo último que se le pidió.
export interface SupplierContextDto {
  supplierId: string;
  ordersCount: number;
  averageCents: number;
  lastOrder: PurchaseOrderDto | null;
}

export async function supplierPurchaseContext(supplierId: string): Promise<SupplierContextDto> {
  return getJson(`/purchases/suppliers/${supplierId}/context`);
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrderDto> {
  return sendJson('POST', `/purchases/orders/${id}/cancel`);
}

export interface ReceiveOrderLinePayload {
  lineId: string;
  quantity: number;
  // null = usar el costo pactado de la línea.
  unitCostCents: number | null;
  // YYYY-MM-DD o null.
  expiryDate: string | null;
}

// receptionId lo genera el front: reintentar con el mismo id no duplica stock.
export async function receivePurchaseOrder(
  id: string,
  receptionId: string,
  lines: ReceiveOrderLinePayload[],
  documentNumber: string | null = null,
  paymentTerms: string | null = null,
): Promise<PurchaseOrderDto> {
  return sendJson('POST', `/purchases/orders/${id}/receive`, {
    receptionId,
    documentNumber,
    paymentTerms,
    lines,
  });
}
