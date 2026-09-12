import { getJson, sendJson } from '@/shared/api/client';

export interface CategoryDto {
  slug: string;
  name: string;
  active: boolean;
  sortOrder: number;
  // Llaves del set fijo (CategoryIcon / tokens --cat-*); null = default.
  icon: string | null;
  color: string | null;
  productCount?: number;
}

export async function listCategories(includeInactive = false): Promise<CategoryDto[]> {
  const params = includeInactive ? '?includeInactive=true' : '';
  return getJson(`/catalog/categories${params}`);
}

export async function createCategory(name: string): Promise<CategoryDto> {
  return sendJson('POST', '/catalog/categories', { name });
}

export async function updateCategory(
  slug: string,
  // icon/color: ausente = no cambia, null = quitar, valor = poner.
  changes: { name?: string; active?: boolean; icon?: string | null; color?: string | null },
): Promise<CategoryDto> {
  return sendJson('PUT', `/catalog/categories/${encodeURIComponent(slug)}`, changes);
}

export async function reorderCategories(slugs: string[]): Promise<void> {
  await sendJson('PUT', '/catalog/categories/order', { slugs });
}

export async function deleteCategory(slug: string, reassignTo: string): Promise<{ movedProducts: number }> {
  return sendJson('DELETE', `/catalog/categories/${slug}`, { reassignTo });
}
