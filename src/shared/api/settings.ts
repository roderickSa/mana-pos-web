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
