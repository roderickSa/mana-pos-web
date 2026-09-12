
import {type CloseResultDto } from '@/shared/api/cash';


export const MOVEMENT_LABELS: Record<'withdrawal' | 'expense' | 'deposit' | 'refund', string> = {
  withdrawal: 'Retiro',
  expense: 'Gasto',
  deposit: 'Ingreso',
  refund: 'Devolución',
};

export type ModalState =
  | { kind: 'none' }
  | { kind: 'movement'; movementKind: 'withdrawal' | 'expense' | 'deposit' }
  | { kind: 'close' }
  | { kind: 'closed'; result: CloseResultDto };
