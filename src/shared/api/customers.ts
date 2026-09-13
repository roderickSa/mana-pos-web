import { getJson, sendJson } from '@/shared/api/client';

export interface CustomerAccountDto {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  creditLimitCents: number;
  balanceCents: number;
  debtSince: string | null;
  availableCents: number;
}

export interface CreditEntryDto {
  id: string;
  // charge sube la deuda; payment (abono), reversal (anulación) y refund (devolución) la bajan.
  kind: 'charge' | 'payment' | 'reversal' | 'refund';
  amountCents: number;
  ticketId: string | null;
  paymentMethod: 'cash' | 'yape' | null;
  userId: string;
  createdAt: string;
}

export interface CustomerPayload {
  name: string;
  phone: string | null;
  document: string | null;
  creditLimitCents: number;
}

export async function listCustomers(query: string, onlyDebtors: boolean): Promise<CustomerAccountDto[]> {
  const params = new URLSearchParams();
  if (query.trim() !== '') params.set('query', query);
  if (onlyDebtors) params.set('onlyDebtors', 'true');
  return getJson(`/customers?${params.toString()}`);
}

export interface CustomersPageDto {
  items: CustomerAccountDto[];
  total: number;
  page: number;
  perPage: number;
  // Totales de TODO el resultado filtrado (no solo la página visible).
  totalDebtCents: number;
  totalInFavorCents: number;
}

export async function listCustomersPage(
  query: string,
  onlyDebtors: boolean,
  page: number,
  perPage: number,
): Promise<CustomersPageDto> {
  const params = new URLSearchParams();
  if (query.trim() !== '') params.set('query', query);
  if (onlyDebtors) params.set('onlyDebtors', 'true');
  params.set('page', String(page));
  params.set('perPage', String(perPage));
  return getJson(`/customers?${params.toString()}`);
}

// Un cliente por id: el listado es paginado, así que abrir
// `/clientes/<id>/editar` de frente no lo encuentra en la página cargada.
export async function getCustomer(id: string): Promise<CustomerAccountDto> {
  return getJson(`/customers/${id}`);
}

export async function createCustomer(payload: CustomerPayload): Promise<{ id: string }> {
  return sendJson('POST', '/customers', payload);
}

export async function updateCustomer(id: string, payload: CustomerPayload): Promise<{ id: string }> {
  return sendJson('PUT', `/customers/${id}`, payload);
}

export async function getStatement(
  id: string,
): Promise<{ account: CustomerAccountDto; entries: CreditEntryDto[] }> {
  return getJson(`/customers/${id}/statement`);
}

export async function registerAbono(
  id: string,
  amountCents: number,
  paymentMethod: 'cash' | 'yape',
): Promise<{ newBalanceCents: number }> {
  return sendJson('POST', `/customers/${id}/payments`, { amountCents, paymentMethod });
}
