import { createResource } from 'solid-js';

import { listCategories, type CategoryDto } from '@/shared/api/categories';
import { currentUser } from '@/shared/state/session';

// Categorías compartidas por toda la app (pestañas de venta, selects de
// producto). Se traen TODAS y se filtra al leer: los productos de una
// categoría inactiva siguen necesitando su nombre bonito.
//
// El fetch depende de la sesión: este módulo se importa al arrancar la app,
// ANTES del login, y un fetch en ese momento sale sin Bearer → 401 → el
// resource queda en error y leerlo lanza, rompiendo la pantalla de venta
// tras el primer login (había que recargar). Con la sesión como fuente, se
// pide al entrar (el token ya está en storage) y se vuelve a pedir en cada
// cambio de usuario; sin sesión no se pide nada.
const [resource, { refetch }] = createResource(
  () => currentUser()?.id ?? null,
  () => listCategories(true),
);

// Sin categorías se puede vender igual (Mostrador / Todos): un fallo de red
// aquí no debe tumbar la pantalla, por eso nunca se relanza el error.
function loaded(): CategoryDto[] {
  return resource.error === undefined ? (resource() ?? []) : [];
}

export function activeCategories(): CategoryDto[] {
  return loaded().filter((category) => category.active);
}

export function allCategories(): CategoryDto[] {
  return loaded();
}

export function refreshCategories(): void {
  void refetch();
}

// El servidor devuelve el slug («lacteos-y-embutidos»); la pantalla muestra el
// nombre con el que la categoría se creó. Si no está cargada, el slug es mejor
// que un hueco.
export function categoryName(slug: string): string {
  return loaded().find((category) => category.slug === slug)?.name ?? slug;
}
