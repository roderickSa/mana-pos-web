import { getJson, sendJson } from '@/shared/api/client';

export interface CashSessionDto {
  id: string;
  shift: 'morning' | 'afternoon';
  status: 'open' | 'closed';
  openedBy: string;
  openedAt: string;
  openingAmountCents: number;
  closedAt: string | null;
  expectedCashCents: number | null;
  countedCashCents: number | null;
}

export interface CashBreakdownDto {
  openingCents: number;
  cashSalesCents: number;
  cashAbonosCents: number;
  withdrawalsCents: number;
  expensesCents: number;
  currentCashCents: number;
}

export interface CashMovementDto {
  id: string;
  kind: 'withdrawal' | 'expense';
  amountCents: number;
  concept: string;
  userId: string;
  createdAt: string;
}

export type CashStatusDto =
  | { open: true; session: CashSessionDto; breakdown: CashBreakdownDto; movements: CashMovementDto[] }
  | { open: false; lastClosed: CashSessionDto | null };

export interface CloseResultDto {
  session: CashSessionDto;
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
  userId: string,
): Promise<CashSessionDto> {
  return sendJson('POST', '/cash/open', { shift, openingAmountCents, userId });
}

export async function registerCashMovement(
  kind: 'withdrawal' | 'expense',
  amountCents: number,
  concept: string,
  userId: string,
): Promise<{ currentCashCents: number }> {
  return sendJson('POST', '/cash/movements', { kind, amountCents, concept, userId });
}

export async function closeCash(countedCashCents: number, userId: string): Promise<CloseResultDto> {
  return sendJson('POST', '/cash/close', { countedCashCents, userId });
}
