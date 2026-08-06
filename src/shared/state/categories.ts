import { createResource } from 'solid-js';

import { listCategories, type CategoryDto } from '@/shared/api/categories';

// Categorías compartidas por toda la app (pestañas de venta, selects de
// producto). Se traen TODAS y se filtra al leer: los productos de una
// categoría inactiva siguen necesitando su nombre bonito.
const [resource, { refetch }] = createResource(() => listCategories(true));

export function activeCategories(): CategoryDto[] {
  return (resource() ?? []).filter((category) => category.active);
}

export function allCategories(): CategoryDto[] {
  return resource() ?? [];
}

export function refreshCategories(): void {
  void refetch();
}
