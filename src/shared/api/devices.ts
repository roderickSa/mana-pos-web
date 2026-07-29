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
