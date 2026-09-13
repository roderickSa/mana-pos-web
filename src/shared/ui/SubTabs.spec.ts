import { describe, expect, it } from 'vitest';

import { activeTabPath, type SubTab } from './SubTabs';

const TABS: SubTab[] = [
  { path: '/inventario/entradas', label: 'Entradas y mermas' },
  { path: '/inventario/conteo', label: 'Conteo físico' },
  { path: '/inventario/por-vencer', label: 'Por vencer' },
  { path: '/inventario/kardex', label: 'Kardex' },
];

describe('activeTabPath', () => {
  it('marks the tab whose path is the current one', () => {
    expect(activeTabPath(TABS, '/inventario/kardex')).toBe('/inventario/kardex');
  });

  // A modal hanging off a tab must keep its tab lit.
  it('keeps the tab marked while a child route is open', () => {
    expect(activeTabPath(TABS, '/inventario/kardex/t-42')).toBe('/inventario/kardex');
  });

  it('falls back to the first tab when nothing matches', () => {
    expect(activeTabPath(TABS, '/inventario')).toBe('/inventario/entradas');
  });

  it('prefers the longest match when one path starts with another', () => {
    const nested: SubTab[] = [
      { path: '/compras/ordenes', label: 'Órdenes' },
      { path: '/compras/ordenes/nueva', label: 'Nueva' },
    ];

    expect(activeTabPath(nested, '/compras/ordenes/nueva')).toBe('/compras/ordenes/nueva');
    expect(activeTabPath(nested, '/compras/ordenes')).toBe('/compras/ordenes');
  });

  it('does not match a path that merely starts the same', () => {
    expect(activeTabPath(TABS, '/inventario/kardexX')).toBe('/inventario/entradas');
  });
});
