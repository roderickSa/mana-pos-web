import { describe, expect, it } from 'vitest';

import type { ProductDto } from '@/shared/types';
import {
  decodeOrderDraft,
  deliveryDay,
  encodeOrderDraft,
  isEmptyOrderDraft,
  restoreLines,
  storedLines,
  type OrderDraftSnapshot,
} from './order-draft';

function productMother(id: string): ProductDto {
  return {
    id,
    name: `Producto ${id}`,
    category: 'abarrotes',
    barcode: null,
    shortCode: null,
    saleType: 'unit',
    priceCents: 500,
    costCents: 300,
    stockUnits: 4,
    stockMinimum: 2,
    active: true,
    quickAccess: false,
    imagePath: null,
    supplierIds: [],
  };
}

// `encodeOrderDraft` devuelve `unknown` (es lo que se escribe en el
// navegador); para armar variantes rotas hace falta verlo como objeto.
function comoObjeto(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {};
}

const VACIO: OrderDraftSnapshot = {
  supplierId: '',
  notes: '',
  expectedAt: '',
  headerOpen: true,
  lines: [],
};

describe('encode and decode', () => {
  it('brings back what was typed', () => {
    const snapshot: OrderDraftSnapshot = {
      ...VACIO,
      supplierId: 'prov-1',
      notes: 'llamar antes',
      lines: [{ productId: 'p-1', quantity: '3', cost: '12.50', packSize: 12 }],
    };

    const back = decodeOrderDraft(encodeOrderDraft(snapshot));

    expect(back).toMatchObject({ supplierId: 'prov-1', notes: 'llamar antes' });
    expect(back?.lines).toEqual(snapshot.lines);
  });

  // Un borrador de una versión anterior de la app no debe romper la pantalla.
  it('rejects anything that is not the shape it saves', () => {
    expect(decodeOrderDraft(null)).toBeUndefined();
    expect(decodeOrderDraft({ supplierId: 'p-1' })).toBeUndefined();
    const base = comoObjeto(encodeOrderDraft(VACIO));
    expect(decodeOrderDraft({ ...base, lines: 'ninguna' })).toBeUndefined();
    expect(decodeOrderDraft({ ...base, lines: [{ productId: 'p-1' }] })).toBeUndefined();
    expect(decodeOrderDraft({ ...base, headerOpen: 'sí' })).toBeUndefined();
  });
});

describe('lines', () => {
  it('saves only what was typed, not the product', () => {
    const linea = { product: productMother('p-1'), quantity: '2', cost: '9.90', packSize: null };

    expect(storedLines([linea])).toEqual([
      { productId: 'p-1', quantity: '2', cost: '9.90', packSize: null },
    ]);
  });

  it('rebuilds them from the catalogue of today', () => {
    const producto = productMother('p-1');

    const { lines, missing } = restoreLines(
      [{ productId: 'p-1', quantity: '2', cost: '9.90', packSize: 6 }],
      new Map([['p-1', producto]]),
    );

    expect(missing).toBe(0);
    expect(lines).toEqual([{ product: producto, quantity: '2', cost: '9.90', packSize: 6 }]);
  });

  // Un producto borrado o fusionado no puede frenar la vuelta del resto.
  it('skips the products that are no longer there, and says how many', () => {
    const { lines, missing } = restoreLines(
      [
        { productId: 'p-1', quantity: '2', cost: '9.90', packSize: null },
        { productId: 'se-fue', quantity: '1', cost: '1.00', packSize: null },
      ],
      new Map([['p-1', productMother('p-1')]]),
    );

    expect(lines).toHaveLength(1);
    expect(missing).toBe(1);
  });
});

describe('when there is nothing to keep', () => {
  it('an untouched form leaves no draft', () => {
    expect(isEmptyOrderDraft(VACIO)).toBe(true);
  });

  it('a supplier chosen is already worth keeping', () => {
    expect(isEmptyOrderDraft({ ...VACIO, supplierId: 'prov-1' })).toBe(false);
  });

  it('so is a line, even half typed', () => {
    expect(
      isEmptyOrderDraft({
        ...VACIO,
        lines: [{ productId: 'p-1', quantity: '', cost: '', packSize: null }],
      }),
    ).toBe(false);
  });
});

describe('deliveryDay', () => {
  // El servidor devuelve la fecha con hora y solo acepta el día: sin esta
  // vuelta, editar un borrador traído del servidor daba 400 en cada cambio.
  it('takes the day out of what the server returns', () => {
    expect(deliveryDay('2026-09-25T17:00:00.000Z')).toBe('2026-09-25');
  });

  it('leaves a plain day alone, without moving it a day back', () => {
    expect(deliveryDay('2026-09-25')).toBe('2026-09-25');
  });

  it('gives nothing when there is no date', () => {
    expect(deliveryDay(null)).toBe('');
    expect(deliveryDay('')).toBe('');
    expect(deliveryDay('cualquier cosa')).toBe('');
  });
});
