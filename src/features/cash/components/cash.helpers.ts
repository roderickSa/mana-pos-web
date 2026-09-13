
import {type CloseResultDto } from '@/shared/api/cash';


export const MOVEMENT_LABELS: Record<'withdrawal' | 'expense' | 'deposit' | 'refund', string> = {
  withdrawal: 'Retiro',
  expense: 'Gasto',
  deposit: 'Ingreso',
  refund: 'Devolución',
};

export type MovementKind = 'withdrawal' | 'expense' | 'deposit';

// Los modales de caja son rutas: `/caja/gasto` se recarga sin perder la
// pantalla. El resumen del cierre NO: es el resultado de algo que ya pasó, y
// una URL que lo reabre mostraría un cierre viejo sin datos.
const MOVEMENT_OF: Record<string, MovementKind> = {
  ingreso: 'deposit',
  retiro: 'withdrawal',
  gasto: 'expense',
};

export const MOVEMENT_SEGMENT: Record<MovementKind, string> = {
  deposit: 'ingreso',
  withdrawal: 'retiro',
  expense: 'gasto',
};

export type CashModalRoute =
  | { kind: 'none' }
  | { kind: 'movement'; movementKind: MovementKind }
  | { kind: 'close' };

export function parseCashModal(segments: readonly string[]): CashModalRoute {
  if (segments.length !== 1) return { kind: 'none' };
  const [segment] = segments;
  if (segment === undefined) return { kind: 'none' };
  if (segment === 'cerrar') return { kind: 'close' };
  const movementKind = MOVEMENT_OF[segment];
  return movementKind === undefined ? { kind: 'none' } : { kind: 'movement', movementKind };
}

export type ClosedState = { result: CloseResultDto } | null;
