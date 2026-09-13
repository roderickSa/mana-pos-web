import type { ProductDto } from '@/shared/types';
import { getJson, getJsonOrNull, sendJson } from '@/shared/api/client';

export interface CreateProductPayload {
  saleType: 'unit' | 'weight';
  barcode: string | null;
  shortCode: string | null;
  name: string;
  category: string;
  priceCents: number;
  costCents: number;
  // Solo productos por unidad; para pesables van null.
  stockMinimum: number;
  quickAccess: boolean;
  // true = el usuario ya confirmó que el nombre repetido es intencional.
  allowDuplicateName?: boolean;
}

export interface UpdateProductPayload {
  barcode: string | null;
  shortCode: string | null;
  name: string;
  category: string;
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
  supplierId: string | null = null,
  limit: number | null = null,
): Promise<ProductDto[]> {
  const params = new URLSearchParams();
  if (limit !== null) params.set('perPage', String(limit));
  if (query.trim() !== '') params.set('query', query);
  if (category !== null) params.set('category', category);
  if (supplierId !== null) params.set('supplier', supplierId);
  if (includeInactive) params.set('includeInactive', 'true');
  if (onlyQuickAccess) params.set('quickAccess', 'true');
  params.set('orderBy', 'sales');
  return getJson(`/catalog/products?${params.toString()}`);
}

export interface ProductPageExtras {
  category?: string;
  orderBy?: 'name' | 'price' | 'stock' | 'margin';
  orderDir?: 'asc' | 'desc';
}

export async function searchProductsPage(
  query: string,
  page: number,
  perPage: number,
  lowStockOnly = false,
  noCostOnly = false,
  extras: ProductPageExtras = {},
): Promise<ProductsPageDto> {
  const params = new URLSearchParams();
  if (query.trim() !== '') params.set('query', query);
  params.set('includeInactive', 'true');
  if (lowStockOnly) params.set('lowStock', 'true');
  if (noCostOnly) params.set('noCost', 'true');
  if (extras.category !== undefined && extras.category !== '') params.set('category', extras.category);
  if (extras.orderBy !== undefined) {
    params.set('orderBy', extras.orderBy);
    params.set('orderDir', extras.orderDir ?? 'asc');
  }
  params.set('page', String(page));
  params.set('perPage', String(perPage));
  return getJson(`/catalog/products?${params.toString()}`);
}

export async function getProduct(id: string): Promise<ProductDto | null> {
  return getJsonOrNull(`/catalog/products/${id}`);
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
          priceCents: payload.priceCents,
          costCents: payload.costCents,
          stockMinimum: payload.stockMinimum,
          quickAccess: payload.quickAccess,
          allowDuplicateName: payload.allowDuplicateName === true,
        }
      : {
          saleType: 'weight',
          barcode: payload.barcode,
          shortCode: payload.shortCode,
          name: payload.name,
          category: payload.category,
          pricePerKgCents: payload.priceCents,
          costPerKgCents: payload.costCents,
          stockMinimumGrams: payload.stockMinimum,
          quickAccess: payload.quickAccess,
          allowDuplicateName: payload.allowDuplicateName === true,
        };
  return sendJson('POST', '/catalog/products', body);
}

export interface ProductBarcodesDto {
  productId: string;
  barcodes: string[];
}

export async function listProductBarcodes(productId: string): Promise<ProductBarcodesDto> {
  return getJson(`/catalog/products/${productId}/barcodes`);
}

export async function addProductBarcode(productId: string, barcode: string): Promise<ProductBarcodesDto> {
  return sendJson('POST', `/catalog/products/${productId}/barcodes`, { barcode });
}

export async function removeProductBarcode(productId: string, barcode: string): Promise<ProductBarcodesDto> {
  return sendJson('DELETE', `/catalog/products/${productId}/barcodes/${encodeURIComponent(barcode)}`);
}

// Fusiona el duplicado dentro del maestro: suma stock, mueve historial y deja
// los códigos del duplicado como alias del maestro.
export async function mergeProducts(winnerId: string, loserId: string): Promise<ProductDto> {
  return sendJson('POST', '/catalog/products/merge', { winnerId, loserId });
}

export async function linkProductSupplier(productId: string, supplierId: string): Promise<void> {
  await sendJson('POST', `/catalog/products/${productId}/suppliers/${supplierId}`);
}

export async function unlinkProductSupplier(productId: string, supplierId: string): Promise<void> {
  await sendJson('DELETE', `/catalog/products/${productId}/suppliers/${supplierId}`);
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

// Asociación masiva: una categoría entera o una lista de productos.
export async function linkProductsToSupplier(
  supplierId: string,
  selection: { category: string } | { productIds: string[] },
): Promise<{ linkedCount: number }> {
  return sendJson('POST', '/catalog/products/suppliers/bulk', { supplierId, ...selection });
}

export interface ProductSupplyDto {
  productId: string;
  supplierId: string;
  // Condiciones de ESTE proveedor. Nulas mientras nadie las haya capturado.
  unitCostCents: number | null;
  // Cómo lo vende: caja, saco, docena. packSize es cuánto de lo NUESTRO trae
  // (unidades, o gramos en los pesables).
  presentationName: string | null;
  packSize: number | null;
  packCostCents: number | null;
  supplierSku: string | null;
  preferred: boolean;
  updatedAt: string | null;
}

export async function listProductSupplies(productId: string): Promise<ProductSupplyDto[]> {
  return getJson(`/catalog/products/${productId}/supplies`);
}

export async function saveProductSupply(
  productId: string,
  supplierId: string,
  terms: {
    unitCostCents: number | null;
    presentationName?: string | null;
    packSize: number | null;
    packCostCents: number | null;
    supplierSku: string | null;
    preferred: boolean;
  },
): Promise<ProductSupplyDto> {
  return sendJson('PUT', `/catalog/products/${productId}/supplies/${supplierId}`, terms);
}

export interface SupplyBoardRowDto {
  productId: string;
  productName: string;
  category: string;
  saleType: 'unit' | 'weight';
  priceCents: number;
  supplierId: string;
  supplierName: string;
  unitCostCents: number | null;
  presentationName: string | null;
  packSize: number | null;
  packCostCents: number | null;
  preferred: boolean;
}

export async function supplyBoard(filters: {
  supplier?: string;
  category?: string;
  onlyMulti?: boolean;
}): Promise<SupplyBoardRowDto[]> {
  const params = new URLSearchParams();
  if (filters.supplier !== undefined && filters.supplier !== '') params.set('supplier', filters.supplier);
  if (filters.category !== undefined && filters.category !== '') params.set('category', filters.category);
  if (filters.onlyMulti === true) params.set('onlyMulti', 'true');
  return getJson(`/catalog/supplies?${params.toString()}`);
}
