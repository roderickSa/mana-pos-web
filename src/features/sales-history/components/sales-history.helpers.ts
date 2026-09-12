
import {type RefundDto } from '@/shared/api/sales';
import {formatSoles } from '@/shared/lib/money';

export const PER_PAGE = 25;

// Motivos frecuentes de anulación: un toque en vez de teclear.
export const VOID_REASONS = ['Se registró mal', 'Cliente se arrepintió', 'Precio incorrecto'];

// Motivos frecuentes de devolución.
export const REFUND_REASONS = ['Producto vencido', 'Producto dañado', 'Cliente se arrepintió'];

export function toLocalISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function refundChannelLabel(refund: RefundDto): string {
  if (refund.cashCents === 0) return 'abonada al fiado del cliente';
  if (refund.creditCents === 0) return 'pagada de caja';
  return `${formatSoles(refund.creditCents)} al fiado y ${formatSoles(refund.cashCents)} de caja`;
}
