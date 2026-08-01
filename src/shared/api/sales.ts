import { getJson, sendJson } from '@/shared/api/client';
import type { TicketLine } from '@/shared/types';

export interface CheckoutResponseDto {
  id: string;
  number: number;
  status: string;
  totalCents: number;
  changeCents: number | null;
  printerWarning: string | null;
}

export type PaymentMethod = 'cash' | 'yape' | 'card' | 'credit';

export interface PaymentPart {
  method: PaymentMethod;
  amountCents: number;
  receivedCents?: number | null;
  customerId?: string | null;
}

// El backend acepta hasta 4 pagos que sumen el total (multi-tender).
export async function checkoutSaleWithPayments(
  ticketId: string,
  lines: TicketLine[],
  payments: PaymentPart[],
  userName = 'cajera',
): Promise<CheckoutResponseDto> {
  const payload = {
    ticketId,
    lines: lines.map((line) =>
      line.weightGrams !== null
        ? {
            saleType: 'weight',
            productId: line.product.id,
            grams: line.weightGrams,
            weightSource: line.weightSource ?? 'manual',
          }
        : { saleType: 'unit', productId: line.product.id, quantity: line.quantity },
    ),
    userId: userName,
    payments,
  };
  return sendJson('POST', '/sales/checkout', payload);
}

export async function checkoutSale(
  ticketId: string,
  lines: TicketLine[],
  method: PaymentMethod,
  totalCents: number,
  receivedCents: number | null,
  customerId: string | null = null,
  userName = 'cajera',
): Promise<CheckoutResponseDto> {
  const payment: PaymentPart =
    method === 'cash'
      ? { method, amountCents: totalCents, receivedCents }
      : method === 'credit'
        ? { method, amountCents: totalCents, customerId }
        : { method, amountCents: totalCents };
  return checkoutSaleWithPayments(ticketId, lines, [payment], userName);
}

export interface TicketListItemDto {
  id: string;
  number: number;
  status: 'charged' | 'voided';
  totalCents: number;
  chargedAt: string | null;
  methods: string[];
  userId: string;
}

export interface SalesPageDto {
  items: TicketListItemDto[];
  total: number;
  page: number;
  perPage: number;
  summary: {
    chargedCount: number;
    chargedTotalCents: number;
    byMethod: Array<{ method: string; amountCents: number }>;
    voidedByUser: Array<{ user: string; count: number; totalCents: number }>;
    soldByUser: Array<{ user: string; count: number; totalCents: number }>;
    // Desglose informativo: el precio cobrado ya incluye IGV.
    igv: IgvBreakdownDto;
  };
}

export interface IgvBreakdownDto {
  ratePercent: number;
  baseCents: number;
  igvCents: number;
}

export interface SalesFilters {
  from: string;
  to: string;
  method: string;
  status: string;
}

function salesParams(filters: SalesFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from !== '') params.set('from', filters.from);
  if (filters.to !== '') params.set('to', filters.to);
  if (filters.method !== '') params.set('method', filters.method);
  if (filters.status !== '') params.set('status', filters.status);
  return params;
}

export async function searchSales(filters: SalesFilters, page: number, perPage: number): Promise<SalesPageDto> {
  const params = salesParams(filters);
  params.set('page', String(page));
  params.set('perPage', String(perPage));
  return getJson(`/sales/tickets?${params.toString()}`);
}

export function salesExportUrl(filters: SalesFilters): string {
  const params = salesParams(filters);
  return `/sales/tickets/export.csv?${params.toString()}`;
}

export async function voidTicketRequest(
  ticketId: string,
  voidedBy: string,
  reason: string,
): Promise<void> {
  await sendJson('POST', `/sales/tickets/${ticketId}/void`, { voidedBy, reason });
}

export async function reprintTicket(ticketId: string): Promise<{ message: string }> {
  return sendJson('POST', `/sales/tickets/${ticketId}/reprint`);
}

export interface TicketDetailDto {
  id: string;
  number: number;
  status: string;
  totalCents: number;
  userId: string;
  createdAt: string;
  chargedAt: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  lines: Array<{
    description: string;
    quantity: number | null;
    grams: number | null;
    unitPriceCents: number;
    totalCents: number;
  }>;
  payments: Array<{ method: string; amountCents: number }>;
  igv: IgvBreakdownDto;
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetailDto> {
  return getJson(`/sales/tickets/${ticketId}`);
}
