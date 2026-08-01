import { getJson, sendJson } from '@/shared/api/client';

export interface CategoryDto {
  slug: string;
  name: string;
  active: boolean;
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
  changes: { name?: string; active?: boolean },
): Promise<CategoryDto> {
  return sendJson('PUT', `/catalog/categories/${encodeURIComponent(slug)}`, changes);
}
