import type { ProductDto } from '@/shared/types';
import { getJson, getJsonOrNull, sendJson } from '@/shared/api/client';

export interface CreateProductPayload {
  saleType: 'unit' | 'weight';
  barcode: string | null;
  shortCode: string | null;
  name: string;
  category: string;
  supplierId: string | null;
  priceCents: number;
  costCents: number;
  stockMinimum: number;
  quickAccess: boolean;
}

export interface UpdateProductPayload {
  barcode: string | null;
  shortCode: string | null;
  name: string;
  category: string;
  supplierId: string | null;
  priceCents: number;
  costCents: number;
  stockMinimum: number;
  active: boolean;
  quickAccess: boolean;
}

export interface ProductsPageDto {
  items: ProductDto[];
  total: number;
  page: number;
  perPage: number;
}

export async function searchProducts(
  query: string,
  category: string | null,
  includeInactive = false,
  onlyQuickAccess = false,
): Promise<ProductDto[]> {
  const params = new URLSearchParams();
  if (query.trim() !== '') params.set('query', query);
  if (category !== null) params.set('category', category);
  if (includeInactive) params.set('includeInactive', 'true');
  if (onlyQuickAccess) params.set('quickAccess', 'true');
  params.set('orderBy', 'sales');
  return getJson(`/catalog/products?${params.toString()}`);
}

export async function searchProductsPage(
  query: string,
  page: number,
  perPage: number,
  lowStockOnly = false,
): Promise<ProductsPageDto> {
  const params = new URLSearchParams();
  if (query.trim() !== '') params.set('query', query);
  params.set('includeInactive', 'true');
  if (lowStockOnly) params.set('lowStock', 'true');
  params.set('page', String(page));
  params.set('perPage', String(perPage));
  return getJson(`/catalog/products?${params.toString()}`);
}

export async function getProductByBarcode(barcode: string): Promise<ProductDto | null> {
  return getJsonOrNull(`/catalog/products/by-barcode/${encodeURIComponent(barcode)}`);
}

export async function createProduct(payload: CreateProductPayload): Promise<ProductDto> {
  const body: Record<string, unknown> =
    payload.saleType === 'unit'
      ? {
          saleType: 'unit',
          barcode: payload.barcode,
          shortCode: payload.shortCode,
          name: payload.name,
          category: payload.category,
          supplierId: payload.supplierId,
          priceCents: payload.priceCents,
          costCents: payload.costCents,
          stockMinimum: payload.stockMinimum,
          quickAccess: payload.quickAccess,
        }
      : {
          saleType: 'weight',
          barcode: payload.barcode,
          shortCode: payload.shortCode,
          name: payload.name,
          category: payload.category,
          supplierId: payload.supplierId,
          pricePerKgCents: payload.priceCents,
          costPerKgCents: payload.costCents,
          stockMinimumGrams: payload.stockMinimum,
          quickAccess: payload.quickAccess,
        };
  return sendJson('POST', '/catalog/products', body);
}

export async function updateProduct(id: string, payload: UpdateProductPayload): Promise<ProductDto> {
  return sendJson('PUT', `/catalog/products/${id}`, payload);
}

export async function setProductImage(id: string, imageBase64: string): Promise<ProductDto> {
  return sendJson('PUT', `/catalog/products/${id}/image`, { imageBase64 });
}

export async function removeProductImage(id: string): Promise<ProductDto> {
  return sendJson('DELETE', `/catalog/products/${id}/image`);
}

export interface ImportReportDto {
  createdCount: number;
  totalRows: number;
  rejected: Array<{ row: number; name: string; reason: string }>;
}

export async function importProducts(fileBase64: string): Promise<ImportReportDto> {
  return sendJson('POST', '/catalog/products/import', { fileBase64 });
}
