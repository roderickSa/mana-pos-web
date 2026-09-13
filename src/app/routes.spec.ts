import { describe, expect, it } from 'vitest';

import { canAccess, homeFor, sectionOf, sectionsFor } from './routes';

describe('routes', () => {
  it('sends the owner to the dashboard and everyone else to the till', () => {
    expect(homeFor('owner')).toBe('/inicio');
    expect(homeFor('manager')).toBe('/vender');
    expect(homeFor('cashier')).toBe('/vender');
  });

  it('names the section a path belongs to, however deep', () => {
    expect(sectionOf('/productos')).toBe('productos');
    expect(sectionOf('/productos/abc123/editar')).toBe('productos');
    expect(sectionOf('/inventario/kardex')).toBe('inventario');
    expect(sectionOf('/ajustes/respaldo')).toBe('ajustes');
  });

  it('does not confuse a section with a path that merely starts the same', () => {
    expect(sectionOf('/productosX')).toBeUndefined();
    expect(sectionOf('/ventanilla')).toBeUndefined();
  });

  it('has no section for an unknown path', () => {
    expect(sectionOf('/loquesea')).toBeUndefined();
  });

  it('lets everyone into the operational screens', () => {
    for (const role of ['owner', 'manager', 'cashier'] as const) {
      expect(canAccess('/vender', role)).toBe(true);
      expect(canAccess('/caja', role)).toBe(true);
      expect(canAccess('/historial', role)).toBe(true);
      expect(canAccess('/clientes/directorio', role)).toBe(true);
    }
  });

  it('keeps the cashier out of the administrative screens', () => {
    for (const path of ['/productos', '/inventario/kardex', '/compras/ordenes', '/reportes/resumen', '/ajustes/usuarios']) {
      expect(canAccess(path, 'cashier')).toBe(false);
      expect(canAccess(path, 'manager')).toBe(true);
      expect(canAccess(path, 'owner')).toBe(true);
    }
  });

  it('keeps the dashboard for the owner alone', () => {
    expect(canAccess('/inicio', 'owner')).toBe(true);
    expect(canAccess('/inicio', 'manager')).toBe(false);
    expect(canAccess('/inicio', 'cashier')).toBe(false);
  });

  // Backups is stricter than the section it hangs from.
  it('keeps backups for the owner even though settings is the manager\'s', () => {
    expect(canAccess('/ajustes/usuarios', 'manager')).toBe(true);
    expect(canAccess('/ajustes/respaldo', 'manager')).toBe(false);
    expect(canAccess('/ajustes/respaldo', 'owner')).toBe(true);
  });

  it('refuses a path that is not in the table', () => {
    expect(canAccess('/loquesea', 'owner')).toBe(false);
  });

  it('shows the cashier only her four screens in the top bar', () => {
    expect(sectionsFor('cashier').map((route) => route.section)).toEqual([
      'venta',
      'caja',
      'ventas',
      'clientes',
    ]);
  });

  it('gives the owner the dashboard first', () => {
    expect(sectionsFor('owner')[0]?.section).toBe('inicio');
    expect(sectionsFor('manager').map((route) => route.section)).not.toContain('inicio');
  });

  it('never puts settings in the top bar: it lives in the gear', () => {
    for (const role of ['owner', 'manager', 'cashier'] as const) {
      expect(sectionsFor(role).map((route) => route.section)).not.toContain('ajustes');
    }
  });
});
