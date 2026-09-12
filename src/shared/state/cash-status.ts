import { createResource, createSignal } from 'solid-js';

import { getCashStatus, type CashStatusDto } from '@/shared/api/cash';
import { cashRefreshVersion } from '@/shared/state/cash-refresh';
import { currentUser } from '@/shared/state/session';

// Un solo resource de caja para toda la app (TopBar, banner, Vender, Caja):
// antes cada uno tenía el suyo y el API recibía /cash/status por triplicado
// cada 15 s. bumpCashRefresh() sigue refrescando al instante tras cada
// operación; el intervalo solo cubre lo que pase fuera de esta pantalla.
const POLL_MS = 30_000;
const [tick, setTick] = createSignal(0);
setInterval(() => setTick((value) => value + 1), POLL_MS);

const [status, { refetch }] = createResource(
  () => (currentUser() === null ? null : { tick: tick(), version: cashRefreshVersion() }),
  () => getCashStatus(),
);

export function cashStatus(): CashStatusDto | undefined {
  return status.error === undefined ? status() : undefined;
}

export function cashStatusFailed(): boolean {
  return status.error !== undefined;
}

export function refetchCashStatus(): void {
  void refetch();
}

// Efectivo en el cajón (null = caja cerrada o sin dato).
export function cashInDrawerCents(): number | null {
  const current = cashStatus();
  return current === undefined || !current.open ? null : current.breakdown.currentCashCents;
}
