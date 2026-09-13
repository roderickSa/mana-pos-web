import { describe, expect, it } from 'vitest';

import { entityAction, subPath, withSearch, withSearchParam } from './modal-route';

describe('subPath', () => {
  it('gives nothing for the list itself', () => {
    expect(subPath('/productos', '/productos')).toEqual([]);
  });

  it('gives the id and the action of an open modal', () => {
    expect(subPath('/productos', '/productos/p-1/editar')).toEqual(['p-1', 'editar']);
  });

  it('gives a single segment for a modal without entity', () => {
    expect(subPath('/productos', '/productos/nuevo')).toEqual(['nuevo']);
  });

  it('ignores a trailing slash', () => {
    expect(subPath('/productos', '/productos/')).toEqual([]);
  });

  // '/productos-precios' no es hijo de '/productos'.
  it('does not match a route that only starts the same', () => {
    expect(subPath('/productos', '/productos-precios')).toEqual([]);
  });

  it('is empty for an unrelated route', () => {
    expect(subPath('/productos', '/clientes/c-1/editar')).toEqual([]);
  });
});

describe('withSearch', () => {
  it('carries the filters of the list into the modal route', () => {
    expect(withSearch('/productos/p-1/editar', '?q=arroz&pagina=3')).toBe(
      '/productos/p-1/editar?q=arroz&pagina=3',
    );
  });

  it('leaves the path alone when there are no filters', () => {
    expect(withSearch('/productos', '')).toBe('/productos');
  });
});

describe('withSearchParam', () => {
  it('keeps the filters and adds the datum of the modal', () => {
    expect(withSearchParam('/productos/nuevo', '?q=775&pagina=2', 'codigo', '775')).toBe(
      '/productos/nuevo?q=775&pagina=2&codigo=775',
    );
  });

  it('drops it when there is nothing to carry', () => {
    expect(withSearchParam('/productos/nuevo', '?codigo=775', 'codigo', null)).toBe(
      '/productos/nuevo',
    );
  });

  it('works with an empty search', () => {
    expect(withSearchParam('/productos/nuevo', '', 'codigo', '775')).toBe(
      '/productos/nuevo?codigo=775',
    );
  });
});

describe('entityAction', () => {
  const ACTIONS = ['editar', 'abonar'] as const;

  it('reads the id and the action', () => {
    expect(entityAction(['c-1', 'abonar'], ACTIONS)).toEqual({ id: 'c-1', action: 'abonar' });
  });

  it('ignores an action the screen does not know', () => {
    expect(entityAction(['c-1', 'inventado'], ACTIONS)).toBeUndefined();
  });

  it('ignores anything that is not exactly id plus action', () => {
    expect(entityAction([], ACTIONS)).toBeUndefined();
    expect(entityAction(['nuevo'], ACTIONS)).toBeUndefined();
    expect(entityAction(['c-1', 'editar', 'de-mas'], ACTIONS)).toBeUndefined();
  });
});
