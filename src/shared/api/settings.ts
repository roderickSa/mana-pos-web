import { getJson, sendJson } from '@/shared/api/client';

export interface ReceiptConfigDto {
  storeName: string;
  headerExtra: string | null;
  footerMessage: string;
}

export async function getReceiptConfig(): Promise<ReceiptConfigDto> {
  return getJson('/settings/receipt');
}

export async function updateReceiptConfig(config: ReceiptConfigDto): Promise<ReceiptConfigDto> {
  return sendJson('PUT', '/settings/receipt', config);
}

export interface IgvConfigDto {
  ratePercent: number;
}

export async function getIgvConfig(): Promise<IgvConfigDto> {
  return getJson('/settings/igv');
}

export async function updateIgvConfig(ratePercent: number): Promise<IgvConfigDto> {
  return sendJson('PUT', '/settings/igv', { ratePercent });
}
