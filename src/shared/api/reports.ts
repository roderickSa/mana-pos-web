import { getJson } from '@/shared/api/client';

export interface SalesTotalsDto {
  tickets: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  discountCents: number;
  refundsCents: number;
  averageTicketCents: number;
}

export interface DailySalesDto {
  day: string;
  tickets: number;
  revenueCents: number;
  costCents: number;
}

export interface ProductSalesDto {
  productId: string;
  name: string;
  category: string;
  saleType: 'unit' | 'weight';
  quantitySold: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

export interface CategorySalesDto {
  category: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  linesCount: number;
}

export interface HourSalesDto {
  hour: number;
  tickets: number;
  revenueCents: number;
}

export interface SalesReportDto {
  from: string;
  to: string;
  totals: SalesTotalsDto;
  byDay: DailySalesDto[];
  byProduct: ProductSalesDto[];
  byCategory: CategorySalesDto[];
  byHour: HourSalesDto[];
}

export interface WasteRowDto {
  productId: string;
  name: string;
  saleType: 'unit' | 'weight';
  kind: 'waste' | 'expiry' | 'theft';
  quantity: number;
  valueCents: number;
}

export interface WasteReportDto {
  totalCents: number;
  rows: WasteRowDto[];
}

// from/to: días locales YYYY-MM-DD, inclusivos.
export async function getSalesReport(from: string, to: string): Promise<SalesReportDto> {
  return getJson(`/reports/sales?from=${from}&to=${to}`);
}

export async function getWasteReport(from: string, to: string): Promise<WasteReportDto> {
  return getJson(`/reports/waste?from=${from}&to=${to}`);
}
