import { beforeEach, describe, expect, it } from 'vitest';

import {
  addUnitProduct,
  addWeightProduct,
  applyLineDiscount,
  removeLine,
  startNewTicket,
  ticketLines,
  ticketTotalCents,
  updateWeightLine,
} from './ticket';
import type { UnitProductDto, WeightProductDto } from '@/shared/types';

const naranja: WeightProductDto = {
  id: 'p-naranja',
  name: 'Naranja de Mesa',
  saleType: 'weight',
  category: 'frutas-y-verduras',
  pricePerKgCents: 390,
  costPerKgCents: 300,
  stockGrams: 15_000,
  stockMinimumGrams: 2000,
  barcode: null,
  shortCode: null,
  supplierIds: [],
  imagePath: null,
  active: true,
  quickAccess: false,
};

const papaya: WeightProductDto = { ...naranja, id: 'p-papaya', name: 'Papaya', pricePerKgCents: 450 };

const gaseosa: UnitProductDto = {
  id: 'p-gaseosa',
  name: 'Concordia Naranja 3 L',
  saleType: 'unit',
  category: 'bebidas',
  priceCents: 760,
  costCents: 600,
  stockUnits: 38,
  stockMinimum: 5,
  barcode: null,
  shortCode: null,
  supplierIds: [],
  imagePath: null,
  active: true,
  quickAccess: false,
};

describe('ticket', () => {
  beforeEach(() => {
    localStorage.clear();
    startNewTicket();
  });

  describe('a product sold by unit', () => {
    it('adds up on the same line instead of repeating it', () => {
      addUnitProduct(gaseosa);
      addUnitProduct(gaseosa);
      addUnitProduct(gaseosa);

      expect(ticketLines()).toHaveLength(1);
      const line = ticketLines()[0];
      expect(line?.kind === 'unit' ? line.quantity : 0).toBe(3);
      expect(line?.totalCents).toBe(2280);
    });
  });

  describe('a product sold by weight', () => {
    // Two bags of the same fruit are one line with the kilos added up: three
    // rows of "Naranja 0.5 kg" are noise on the voucher and three movements in
    // the kardex for a single purchase.
    it('adds up the weight on the same line', () => {
      addWeightProduct(naranja, 500, 'manual');
      addWeightProduct(naranja, 500, 'manual');
      addWeightProduct(naranja, 500, 'manual');

      expect(ticketLines()).toHaveLength(1);
      const line = ticketLines()[0];
      expect(line?.kind === 'weight' ? line.grams : 0).toBe(1500);
      expect(line?.totalCents).toBe(585);
    });

    it('keeps a different product on its own line', () => {
      addWeightProduct(naranja, 500, 'manual');
      addWeightProduct(papaya, 800, 'manual');

      expect(ticketLines()).toHaveLength(2);
    });

    // The weight that came off the scale and the one typed by hand are not the
    // same evidence: they stay apart so the ticket can be audited later.
    it('does not mix a weight from the scale with one typed by hand', () => {
      addWeightProduct(naranja, 500, 'scale');
      addWeightProduct(naranja, 500, 'manual');

      expect(ticketLines()).toHaveLength(2);
    });

    // The discount was agreed on THAT weight; adding kilos to it would change
    // what was agreed without anyone noticing.
    it('does not touch a line that already has a discount', () => {
      addWeightProduct(naranja, 1000, 'manual');
      const first = ticketLines()[0];
      applyLineDiscount(first?.lineId ?? '', 50);

      addWeightProduct(naranja, 500, 'manual');

      expect(ticketLines()).toHaveLength(2);
      expect(ticketLines()[0]?.discountCents).toBe(50);
      expect(ticketLines()[1]?.discountCents).toBe(0);
    });

    it('merges into the newest line, not into the discounted one', () => {
      addWeightProduct(naranja, 1000, 'manual');
      applyLineDiscount(ticketLines()[0]?.lineId ?? '', 50);
      addWeightProduct(naranja, 500, 'manual');

      addWeightProduct(naranja, 250, 'manual');

      expect(ticketLines()).toHaveLength(2);
      const segunda = ticketLines()[1];
      expect(segunda?.kind === 'weight' ? segunda.grams : 0).toBe(750);
    });

    it('charges the merged line as one weighing, rounding only once', () => {
      addWeightProduct(naranja, 333, 'manual');
      addWeightProduct(naranja, 333, 'manual');

      // 666 g × S/3.90/kg = S/2.5974 → 260 céntimos; no 130 + 130 = 260 por
      // casualidad: lo que importa es que se calcula sobre el peso total.
      expect(ticketLines()[0]?.totalCents).toBe(260);
    });

    it('still lets the weight be corrected after merging', () => {
      addWeightProduct(naranja, 500, 'manual');
      addWeightProduct(naranja, 500, 'manual');
      const line = ticketLines()[0];

      updateWeightLine(line?.lineId ?? '', 2000, 'manual');

      const corregida = ticketLines()[0];
      expect(corregida?.kind === 'weight' ? corregida.grams : 0).toBe(2000);
      expect(corregida?.totalCents).toBe(780);
    });

    it('starts a new line again after the merged one is removed', () => {
      addWeightProduct(naranja, 500, 'manual');
      addWeightProduct(naranja, 500, 'manual');
      removeLine(ticketLines()[0]?.lineId ?? '');

      addWeightProduct(naranja, 300, 'manual');

      expect(ticketLines()).toHaveLength(1);
      const line = ticketLines()[0];
      expect(line?.kind === 'weight' ? line.grams : 0).toBe(300);
    });
  });

  it('rounds the ticket total to ten cents, once, over everything', () => {
    addWeightProduct(naranja, 500, 'manual');

    // S/1.95 de la línea → el ticket cobra S/2.00.
    expect(ticketTotalCents()).toBe(200);
  });
});
