import type { SessionUser } from '@/shared/state/session';

// La tabla de rutas y quién puede entrar a cada una. Vive aparte de los
// componentes porque la usan tres cosas distintas: el router (para montar), la
// barra superior (para marcar la activa) y el redirector (para decidir si la
// última ruta guardada todavía es válida para quien entra).

export type Section =
  | 'inicio'
  | 'venta'
  | 'caja'
  | 'ventas'
  | 'clientes'
  | 'productos'
  | 'inventario'
  | 'compras'
  | 'reportes'
  | 'ajustes';

// Jerarquía: dueño ⊇ encargado ⊇ cajera. `encargado` incluye al dueño.
type Access = 'todos' | 'encargado' | 'dueño';

export interface SectionRoute {
  section: Section;
  // Prefijo de la ruta. Todo lo que cuelgue de él hereda el permiso.
  path: string;
  // Adónde va la barra superior al tocar la sección (la primera subpestaña).
  home: string;
  access: Access;
}

export const SECTIONS: readonly SectionRoute[] = [
  { section: 'inicio', path: '/inicio', home: '/inicio', access: 'dueño' },
  { section: 'venta', path: '/vender', home: '/vender', access: 'todos' },
  { section: 'caja', path: '/caja', home: '/caja', access: 'todos' },
  { section: 'ventas', path: '/historial', home: '/historial', access: 'todos' },
  { section: 'clientes', path: '/clientes', home: '/clientes/directorio', access: 'todos' },
  { section: 'productos', path: '/productos', home: '/productos', access: 'encargado' },
  { section: 'inventario', path: '/inventario', home: '/inventario/entradas', access: 'encargado' },
  { section: 'compras', path: '/compras', home: '/compras/ordenes', access: 'encargado' },
  { section: 'reportes', path: '/reportes', home: '/reportes/resumen', access: 'encargado' },
  { section: 'ajustes', path: '/ajustes', home: '/ajustes/usuarios', access: 'encargado' },
];

// Respaldo es del dueño aunque Ajustes sea del encargado: la sub-ruta pide más
// que su sección.
const STRICTER: ReadonlyArray<{ path: string; access: Access }> = [
  { path: '/ajustes/respaldo', access: 'dueño' },
];

function allows(access: Access, role: SessionUser['role']): boolean {
  if (access === 'todos') return true;
  if (access === 'encargado') return role === 'manager' || role === 'owner';
  return role === 'owner';
}

// Coincide por segmento completo: `/productos` no debe matchear `/productosX`.
function startsWithPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function sectionOf(path: string): Section | undefined {
  return SECTIONS.find((route) => startsWithPath(path, route.path))?.section;
}

export function homeFor(role: SessionUser['role']): string {
  return role === 'owner' ? '/inicio' : '/vender';
}

export function canAccess(path: string, role: SessionUser['role']): boolean {
  const stricter = STRICTER.find((rule) => startsWithPath(path, rule.path));
  if (stricter !== undefined) return allows(stricter.access, role);
  const route = SECTIONS.find((item) => startsWithPath(path, item.path));
  // Una ruta que no está en la tabla no se deja pasar: el comodín la manda a
  // `/` y de ahí al inicio del rol.
  if (route === undefined) return false;
  return allows(route.access, role);
}

// Las secciones que la barra superior muestra a este usuario, en orden.
export function sectionsFor(role: SessionUser['role']): readonly SectionRoute[] {
  return SECTIONS.filter((route) => route.section !== 'ajustes' && allows(route.access, role));
}
