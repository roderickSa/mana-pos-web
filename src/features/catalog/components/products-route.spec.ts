import { describe, expect, it } from 'vitest';

import { openProductId, parseProductModal, productActionPath } from './products-route';

describe('parseProductModal', () => {
  it('has nothing open on the list itself', () => {
    expect(parseProductModal([])).toEqual({ kind: 'none' });
  });

  it('opens the new product form', () => {
    expect(parseProductModal(['nuevo'])).toEqual({ kind: 'create' });
  });

  it('opens the screens that have no product', () => {
    expect(parseProductModal(['importar'])).toEqual({ kind: 'import' });
    expect(parseProductModal(['precios'])).toEqual({ kind: 'bulk-prices' });
  });

  it('opens each action on its product', () => {
    expect(parseProductModal(['p-1', 'editar'])).toEqual({ kind: 'edit', id: 'p-1' });
    expect(parseProductModal(['p-1', 'precio'])).toEqual({ kind: 'price', id: 'p-1' });
    expect(parseProductModal(['p-1', 'stock'])).toEqual({ kind: 'stock', id: 'p-1' });
    expect(parseProductModal(['p-1', 'fusionar'])).toEqual({ kind: 'merge', id: 'p-1' });
  });

  // Una URL escrita a mano o vieja no deja la pantalla rota: abre el listado.
  it('ignores an action it does not know', () => {
    expect(parseProductModal(['p-1', 'inventado'])).toEqual({ kind: 'none' });
    expect(parseProductModal(['cualquiera'])).toEqual({ kind: 'none' });
    expect(parseProductModal(['p-1', 'editar', 'de', 'mas'])).toEqual({ kind: 'none' });
  });
});

describe('productActionPath', () => {
  it('builds the route of each action', () => {
    expect(productActionPath('p-1', 'edit')).toBe('/productos/p-1/editar');
    expect(productActionPath('p-1', 'merge')).toBe('/productos/p-1/fusionar');
  });

  it('round-trips with the parser', () => {
    expect(parseProductModal(['p-1', 'precio'])).toEqual({ kind: 'price', id: 'p-1' });
    expect(productActionPath('p-1', 'price')).toBe('/productos/p-1/precio');
  });
});

describe('openProductId', () => {
  it('is the id when the route carries one', () => {
    expect(openProductId({ kind: 'edit', id: 'p-1' })).toBe('p-1');
  });

  it('is nothing for the screens without product', () => {
    expect(openProductId({ kind: 'import' })).toBeUndefined();
    expect(openProductId({ kind: 'none' })).toBeUndefined();
  });
});
