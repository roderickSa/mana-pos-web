import { getJson, sendJson } from '@/shared/api/client';

export interface MovementDto {
  id: string;
  productId: string;
  kind: string;
  quantity: number;
  valueCents: number | null;
  reason: string | null;
  ticketId: string | null;
  userId: string;
  createdAt: string;
}

export interface KardexDto {
  productId: string;
  currentQuantity: number;
  movements: MovementDto[];
}

export async function registerEntry(productId: string, quantity: number): Promise<MovementDto> {
  return sendJson('POST', '/inventory/entries', { productId, quantity });
}

export async function registerAdjustment(
  productId: string,
  kind: 'waste' | 'expiry' | 'theft',
  quantity: number,
  reason: string | null,
): Promise<MovementDto> {
  return sendJson('POST', '/inventory/adjustments', { productId, kind, quantity, reason });
}

export async function setCount(
  productId: string,
  countedQuantity: number,
): Promise<{ difference: number }> {
  return sendJson('POST', '/inventory/counts', { productId, countedQuantity });
}

export async function getKardex(productId: string): Promise<KardexDto> {
  return getJson(`/inventory/kardex/${productId}`);
}

export interface MovementsPageDto {
  items: Array<MovementDto & { productName: string }>;
  total: number;
  page: number;
  perPage: number;
}

export async function searchMovements(filters: {
  query: string;
  kind: string;
  from: string;
  to: string;
  page: number;
  perPage: number;
}): Promise<MovementsPageDto> {
  const params = new URLSearchParams();
  if (filters.query.trim() !== '') params.set('query', filters.query);
  if (filters.kind !== '') params.set('kind', filters.kind);
  if (filters.from !== '') params.set('from', filters.from);
  if (filters.to !== '') params.set('to', filters.to);
  params.set('page', String(filters.page));
  params.set('perPage', String(filters.perPage));
  return getJson(`/inventory/movements?${params.toString()}`);
}
