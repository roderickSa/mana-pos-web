import { getJson, sendJson } from '@/shared/api/client';

export type PurchaseOrderStatus = 'open' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrderSummaryDto {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  linesCount: number;
  totalCents: number;
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
  lines: PurchaseReceptionLineDto[];
}

export interface PurchaseOrderDto {
  id: string;
  number: number;
  supplierId: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  totalCents: number;
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

export async function listPurchaseOrders(): Promise<PurchaseOrderSummaryDto[]> {
  return getJson('/purchases/orders');
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDto> {
  return getJson(`/purchases/orders/${id}`);
}

export async function createPurchaseOrder(
  supplierId: string,
  notes: string | null,
  createdBy: string,
  lines: CreateOrderLinePayload[],
): Promise<PurchaseOrderDto> {
  return sendJson('POST', '/purchases/orders', { supplierId, notes, createdBy, lines });
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

export async function receivePurchaseOrder(
  id: string,
  receivedBy: string,
  lines: ReceiveOrderLinePayload[],
): Promise<PurchaseOrderDto> {
  return sendJson('POST', `/purchases/orders/${id}/receive`, { receivedBy, lines });
}
