import { createResource } from 'solid-js';

import { listCategories, type CategoryDto } from '@/shared/api/categories';

// Categorías activas compartidas por toda la app (pestañas de venta, selects
// de producto). Se refrescan cuando el CRUD de categorías hace cambios.
const [resource, { refetch }] = createResource(() => listCategories(false));

export function activeCategories(): CategoryDto[] {
  return resource() ?? [];
}

export function refreshCategories(): void {
  void refetch();
}
