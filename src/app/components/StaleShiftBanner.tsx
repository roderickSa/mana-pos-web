import { createResource, createSignal, onCleanup, Show, type Component } from 'solid-js';

import { getCashStatus, type CashSessionDto } from '@/shared/api/cash';
import { cashRefreshVersion } from '@/shared/state/cash-refresh';
import styles from './StaleShiftBanner.module.css';

// Un turno normal dura como mucho una jornada: pasadas estas horas lo más
// probable es que ayer nadie cerró caja.
const STALE_AFTER_HOURS = 10;

const SHIFT_LABELS: Record<CashSessionDto['shift'], string> = {
  morning: 'mañana',
  afternoon: 'tarde',
};

async function openSession(): Promise<CashSessionDto | null> {
  try {
    const status = await getCashStatus();
    return status.open ? status.session : null;
  } catch {
    return null;
  }
}

export const StaleShiftBanner: Component<{ onGoToCash: () => void }> = (props) => {
  const [tick, setTick] = createSignal(0);
  const [session] = createResource(
    () => ({ tick: tick(), version: cashRefreshVersion() }),
    openSession,
  );
  const interval = setInterval(() => setTick((value) => value + 1), 60_000);
  onCleanup(() => clearInterval(interval));

  const hoursOpen = () => {
    const current = session();
    if (current === null || current === undefined) return 0;
    return (Date.now() - new Date(current.openedAt).getTime()) / 3_600_000;
  };
  const openedAnotherDay = () => {
    const current = session();
    if (current === null || current === undefined) return false;
    return new Date(current.openedAt).toDateString() !== new Date().toDateString();
  };
  const stale = () => hoursOpen() >= STALE_AFTER_HOURS || (openedAnotherDay() && hoursOpen() >= 4);

  return (
    <Show when={stale() && session()}>
      {(current) => (
        <div class={styles.banner} role="alert">
          <span class={styles.icono} aria-hidden="true">
            ⏰
          </span>
          <span class={styles.texto}>
            El turno {SHIFT_LABELS[current().shift]} lleva <b>{Math.floor(hoursOpen())} h abierto</b>
            {openedAnotherDay() ? ' (se abrió otro día)' : ''} — lo abrió {current().openedBy}.
            ¿Olvidaste cerrar caja? Ciérralo y abre el turno de hoy antes de vender.
          </span>
          <button type="button" class={styles.accion} onClick={props.onGoToCash}>
            Ir a Caja a cerrarlo
          </button>
        </div>
      )}
    </Show>
  );
};
