import type { ProductDto } from '@/shared/types';

export function unitLabel(product: ProductDto): string {
  return product.saleType === 'unit' ? 'unidades' : 'gramos';
}

export function stockOf(product: ProductDto): number {
  return product.saleType === 'unit' ? product.stockUnits : product.stockGrams;
}

export function minimumOf(product: ProductDto): number {
  return product.saleType === 'unit' ? product.stockMinimum : product.stockMinimumGrams;
}

export function priceOf(product: ProductDto): number {
  return product.saleType === 'unit' ? product.priceCents : product.pricePerKgCents;
}

export function costOf(product: ProductDto): number {
  return product.saleType === 'unit' ? product.costCents : product.costPerKgCents;
}
