// Un modal abierto es una ruta hija del listado, no una señal: `/productos`
// sigue montado y el modal se abre porque la URL trae el id. Así recargar,
// compartir el link o el botón Atrás del navegador caen donde la persona
// estaba, y no en la primera página del listado.
//
// Las vistas están montadas en rutas comodín (`/productos/*`), así que cada
// una parte su propia cola de segmentos en vez de declarar rutas hijas.

// Los segmentos que siguen al listado. Sobre '/productos',
// '/productos/p-1/editar' devuelve ['p-1', 'editar'] y '/productos' devuelve [].
export function subPath(base: string, pathname: string): readonly string[] {
  if (pathname === base) return [];
  if (!pathname.startsWith(`${base}/`)) return [];
  return pathname
    .slice(base.length + 1)
    .split('/')
    .filter((segment) => segment !== '');
}

// Los filtros del listado viajan con el modal: cerrar tiene que devolver a la
// misma página y la misma búsqueda, no al principio de todo.
export function withSearch(path: string, search: string): string {
  return `${path}${search}`;
}

// Igual que `withSearch`, pero con un dato propio del modal encima (el código
// de barras con el que se abre un producto nuevo, por ejemplo). `null` lo
// quita, para no arrastrarlo al siguiente modal.
export function withSearchParam(
  path: string,
  search: string,
  name: string,
  value: string | null,
): string {
  const params = new URLSearchParams(search);
  if (value === null || value === '') params.delete(name);
  else params.set(name, value);
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}

// La forma más común de un modal con entidad: `<id>/<acción>`. Devuelve el par
// solo si la acción es una de las que la pantalla conoce, así una URL vieja o
// escrita a mano abre el listado en vez de romper algo.
export function entityAction<A extends string>(
  segments: readonly string[],
  actions: readonly A[],
): { id: string; action: A } | undefined {
  if (segments.length !== 2) return undefined;
  const [id, action] = segments;
  if (id === undefined || action === undefined) return undefined;
  const known = actions.find((candidate) => candidate === action);
  return known === undefined ? undefined : { id, action: known };
}
