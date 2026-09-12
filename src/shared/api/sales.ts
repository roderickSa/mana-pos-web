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

export interface CheckoutDiscounts {
  ticketDiscountCents: number;
  // Token de /users/verify-manager; null si el descuento no lo necesitó.
  approvalToken: string | null;
  // Cliente opcional de la venta (no solo fiado).
  customerId: string | null;
}

const NO_DISCOUNTS: CheckoutDiscounts = { ticketDiscountCents: 0, approvalToken: null, customerId: null };

// El backend acepta hasta 4 pagos que sumen el total (multi-tender).
export async function checkoutSaleWithPayments(
  ticketId: string,
  lines: TicketLine[],
  payments: PaymentPart[],
  discounts: CheckoutDiscounts = NO_DISCOUNTS,
): Promise<CheckoutResponseDto> {
  const payload = {
    ticketId,
    lines: lines.map((line) =>
      line.kind === 'weight'
        ? {
            saleType: 'weight',
            productId: line.product.id,
            grams: line.grams,
            weightSource: line.weightSource,
            discountCents: line.discountCents,
          }
        : {
            saleType: 'unit',
            productId: line.product.id,
            quantity: line.quantity,
            discountCents: line.discountCents,
          },
    ),
    payments,
    ticketDiscountCents: discounts.ticketDiscountCents,
    discountApprovalToken: discounts.approvalToken,
    customerId: discounts.customerId,
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
  discounts: CheckoutDiscounts = NO_DISCOUNTS,
): Promise<CheckoutResponseDto> {
  const payment: PaymentPart =
    method === 'cash'
      ? { method, amountCents: totalCents, receivedCents }
      : method === 'credit'
        ? { method, amountCents: totalCents, customerId }
        : { method, amountCents: totalCents };
  return checkoutSaleWithPayments(ticketId, lines, [payment], discounts);
}

export interface TicketListItemDto {
  id: string;
  number: number;
  status: 'charged' | 'voided';
  totalCents: number;
  chargedAt: string | null;
  methods: string[];
  userId: string;
  customerName: string | null;
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

// approvalToken: de /users/verify-manager cuando quien opera no es encargado.
export async function voidTicketRequest(
  ticketId: string,
  reason: string,
  approvalToken: string | null,
): Promise<void> {
  await sendJson('POST', `/sales/tickets/${ticketId}/void`, { reason, approvalToken });
}

export async function reprintTicket(ticketId: string): Promise<{ message: string }> {
  return sendJson('POST', `/sales/tickets/${ticketId}/reprint`);
}

export interface TicketDetailDto {
  id: string;
  number: number;
  status: string;
  totalCents: number;
  linesTotalCents: number;
  subtotalCents: number;
  // Ajuste del redondeo final a S/0.10 (positivo o negativo).
  roundingCents: number;
  discountCents: number;
  lineDiscountsCents: number;
  discountAuthorizedBy: string | null;
  userId: string;
  createdAt: string;
  chargedAt: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  lines: Array<{
    id: string;
    description: string;
    quantity: number | null;
    grams: number | null;
    unitPriceCents: number;
    discountCents: number;
    totalCents: number;
  }>;
  payments: Array<{ method: string; amountCents: number }>;
  igv: IgvBreakdownDto;
  refunds: RefundDto[];
  refundedCents: number;
  customerId: string | null;
  customerName: string | null;
}

export interface RefundDto {
  id: string;
  ticketId: string;
  reason: string;
  registeredBy: string;
  // Parte abonada al fiado y parte pagada en efectivo (pagos mixtos).
  creditCents: number;
  cashCents: number;
  totalCents: number;
  createdAt: string;
  lines: Array<{
    ticketLineId: string;
    description: string;
    quantity: number;
    amountCents: number;
  }>;
  // Presente solo en la respuesta de registrar (constancia impresa o aviso).
  printerWarning?: string | null;
}

export async function refundTicketRequest(
  ticketId: string,
  lines: Array<{ ticketLineId: string; quantity: number }>,
  reason: string,
  approvalToken: string | null,
): Promise<RefundDto> {
  return sendJson('POST', `/sales/tickets/${ticketId}/refunds`, { lines, reason, approvalToken });
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetailDto> {
  return getJson(`/sales/tickets/${ticketId}`);
}
