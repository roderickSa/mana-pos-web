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
  kind: 'charge' | 'payment';
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
  userId: string,
): Promise<{ newBalanceCents: number }> {
  return sendJson('POST', `/customers/${id}/payments`, { amountCents, paymentMethod, userId });
}
