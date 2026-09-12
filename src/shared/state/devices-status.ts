import { createResource, createSignal } from 'solid-js';

import { getDevicesStatus, type DevicesStatusDto } from '@/shared/api/devices';
import { currentUser } from '@/shared/state/session';

// Estado de equipos compartido (StatusBar y TopBar): un solo /devices/status
// cada 15 s en vez de dos relojes desfasados.
const POLL_MS = 15_000;
const [tick, setTick] = createSignal(0);
setInterval(() => setTick((value) => value + 1), POLL_MS);

const [status] = createResource(
  () => (currentUser() === null ? null : tick()),
  () => getDevicesStatus(),
);

export function devicesStatus(): DevicesStatusDto | undefined {
  return status.error === undefined ? status() : undefined;
}

// El API respondió a la última consulta (undefined mientras no hay dato).
export function apiReachable(): boolean | undefined {
  if (status.error !== undefined) return false;
  return status() === undefined ? undefined : true;
}
