import { getJson, sendJson } from './client';

export type BackupExternalDto =
  | { kind: 'none' }
  | { kind: 'ok'; dir: string }
  | { kind: 'error'; dir: string; reason: string };

export type BackupStatusDto = {
  lastBackupAt: string | null;
  copies: number;
  localDir: string;
  external: BackupExternalDto;
};

export function getBackupStatus(): Promise<BackupStatusDto> {
  return getJson('/backups/status');
}

export function runBackupNow(): Promise<{ file: string; at: string }> {
  return sendJson('POST', '/backups/run');
}

export function setBackupExternalDir(
  directory: string | null,
): Promise<{ directory: string | null }> {
  return sendJson('PUT', '/backups/external-dir', { directory });
}

// Descarga directa (corre un respaldo fresco y lo entrega como archivo).
export const backupExportUrl = '/backups/export';
