import { describe, expect, it } from 'vitest';

import type { PurchaseOrderStatus } from '@/shared/api/purchases';
import { STATUS_HINT, STATUS_LABEL, statusTone } from './purchase-lines';

const TODOS: PurchaseOrderStatus[] = [
  'draft',
  'open',
  'partial',
  'received',
  'cancelled',
  'closed',
];

describe('estados de una orden de compra', () => {
  it('every status is named and explained', () => {
    for (const status of TODOS) {
      expect(STATUS_LABEL[status]).not.toBe('');
      expect(STATUS_HINT[status]).not.toBe('');
    }
  });

  // Rojo = salió mal. Cerrar una orden incompleta es un final sano: la
  // mercadería que llegó ya entró y no queda nada pendiente.
  it('marks only a cancelled order as bad news', () => {
    const rojos = TODOS.filter((status) => statusTone(status) === 'peligro');
    expect(rojos).toEqual(['cancelled']);
  });

  it('says a closed order is incomplete, not just closed', () => {
    expect(STATUS_LABEL.closed).toContain('incompleta');
  });
});
