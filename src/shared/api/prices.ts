import { getJson, sendJson } from '@/shared/api/client';

export interface PriceChangeDto {
  productId: string;
  name: string;
  saleType: 'unit' | 'weight';
  costCents: number;
  oldPriceCents: number;
  newPriceCents: number;
  oldMarginPercent: number | null;
  newMarginPercent: number | null;
}

export interface BulkPricesParams {
  category: string | null;
  supplierId: string | null;
  mode: 'percent' | 'amount';
  value: number;
}

export interface BulkPricesResultDto {
  applied: boolean;
  changes: PriceChangeDto[];
}

export async function previewBulkPrices(params: BulkPricesParams): Promise<BulkPricesResultDto> {
  return sendJson('POST', '/catalog/prices/preview', params);
}

export async function applyBulkPrices(params: BulkPricesParams): Promise<BulkPricesResultDto> {
  return sendJson('POST', '/catalog/prices/apply', params);
}

export interface PriceSuggestionDto {
  productId: string;
  name: string;
  saleType: 'unit' | 'weight';
  costCents: number;
  priceCents: number;
  marginPercent: number | null;
  suggestedPriceCents: number;
  suggestedMarginPercent: number | null;
}

export interface LowMarginDto {
  thresholdPercent: number;
  items: PriceSuggestionDto[];
}

export async function getLowMarginSuggestions(thresholdPercent: number): Promise<LowMarginDto> {
  return getJson(`/catalog/prices/low-margin?threshold=${thresholdPercent}`);
}

export async function applyPriceList(
  updates: Array<{ productId: string; priceCents: number }>,
): Promise<{ applied: number }> {
  return sendJson('POST', '/catalog/prices/apply-list', { updates });
}
