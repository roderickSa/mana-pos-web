import { getJson, sendJson } from '@/shared/api/client';

export interface ScaleStateDto {
  connected: boolean;
  grams: number | null;
  message: string | null;
}

export interface DevicesStatusDto {
  mode: 'simulated' | 'real';
  printer: { message: string };
  scale: ScaleStateDto;
}

export async function getScale(): Promise<ScaleStateDto> {
  return getJson('/devices/scale');
}

export async function getDevicesStatus(): Promise<DevicesStatusDto> {
  return getJson('/devices/status');
}

export interface DeviceActionResultDto {
  ok: boolean;
  message: string;
}

export async function printTestPage(): Promise<DeviceActionResultDto> {
  return sendJson('POST', '/devices/printer/test');
}

export async function openDrawer(): Promise<DeviceActionResultDto> {
  return sendJson('POST', '/devices/drawer/open');
}

export interface PrinterConfigDto {
  // null = usar la impresora por defecto (variable de entorno / auto).
  printerName: string | null;
  paperWidthMm: 58 | 80;
}

export async function getSystemPrinters(): Promise<{ items: string[] }> {
  return getJson('/devices/printers');
}

export async function getPrinterConfig(): Promise<PrinterConfigDto> {
  return getJson('/devices/printer-config');
}

export async function updatePrinterConfig(config: PrinterConfigDto): Promise<PrinterConfigDto> {
  return sendJson('PUT', '/devices/printer-config', config);
}
