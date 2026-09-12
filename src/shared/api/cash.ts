import { getJson, sendJson } from '@/shared/api/client';

interface CashSessionBaseDto {
  id: string;
  shift: 'morning' | 'afternoon';
  openedBy: string;
  openedAt: string;
  openingAmountCents: number;
}

export interface OpenCashSessionDto extends CashSessionBaseDto {
  status: 'open';
}

// Una sesión cerrada siempre trae su cierre completo.
export interface ClosedCashSessionDto extends CashSessionBaseDto {
  status: 'closed';
  closedAt: string;
  expectedCashCents: number;
  countedCashCents: number;
  closedBy: string;
  closingNote: string | null;
}

export type CashSessionDto = OpenCashSessionDto | ClosedCashSessionDto;

export interface CashBreakdownDto {
  openingCents: number;
  cashSalesCents: number;
  cashAbonosCents: number;
  withdrawalsCents: number;
  expensesCents: number;
  depositsCents: number;
  // Devoluciones pagadas en efectivo desde el cajón.
  refundsCents: number;
  currentCashCents: number;
}

export interface CashMovementDto {
  id: string;
  kind: 'withdrawal' | 'expense' | 'deposit' | 'refund';
  amountCents: number;
  concept: string;
  userId: string;
  createdAt: string;
}

export type CashStatusDto =
  | { open: true; session: OpenCashSessionDto; breakdown: CashBreakdownDto; movements: CashMovementDto[] }
  | { open: false; lastClosed: ClosedCashSessionDto | null };

export interface CloseResultDto {
  session: ClosedCashSessionDto;
  breakdown: CashBreakdownDto;
  differenceCents: number;
  salesByMethod: Array<{ method: string; amountCents: number }>;
}

export async function getCashStatus(): Promise<CashStatusDto> {
  return getJson('/cash/status');
}

export async function openCash(
  shift: 'morning' | 'afternoon',
  openingAmountCents: number,
): Promise<OpenCashSessionDto> {
  return sendJson('POST', '/cash/open', { shift, openingAmountCents });
}

export async function registerCashMovement(
  kind: 'withdrawal' | 'expense' | 'deposit',
  amountCents: number,
  concept: string,
): Promise<{ currentCashCents: number }> {
  return sendJson('POST', '/cash/movements', { kind, amountCents, concept });
}

export async function getCashHistory(): Promise<ClosedCashSessionDto[]> {
  return getJson('/cash/history');
}

export async function closeCash(
  countedCashCents: number,
  note: string | null,
): Promise<CloseResultDto> {
  return sendJson('POST', '/cash/close', { countedCashCents, note });
}

export async function printLastCloseSummary(): Promise<{ message: string }> {
  return sendJson('POST', '/cash/print-last-close');
}
