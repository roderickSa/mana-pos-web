import { createResource, createSignal, onCleanup, type Component } from 'solid-js';

import { getDevicesStatus } from '@/shared/api/devices';
import { formatKg } from '@/shared/lib/money';
import styles from './StatusBar.module.css';

async function checkApi(): Promise<boolean> {
  try {
    const response = await fetch('/health');
    return response.ok;
  } catch {
    return false;
  }
}

export const StatusBar: Component = () => {
  const [apiUp, { refetch: refetchApi }] = createResource(checkApi);
  const [tick, setTick] = createSignal(0);
  const [devices] = createResource(tick, () => getDevicesStatus().catch(() => null));

  const interval = setInterval(() => {
    setTick((value) => value + 1);
    void refetchApi();
  }, 10_000);
  onCleanup(() => clearInterval(interval));

  const scaleLabel = () => {
    const status = devices();
    if (status === null || status === undefined) return 'Balanza: sin información';
    if (status.scale.connected && status.scale.grams !== null) {
      return `Balanza: ${formatKg(status.scale.grams)}`;
    }
    return status.mode === 'simulated' ? 'Balanza: peso manual (modo desarrollo)' : 'Balanza: desconectada';
  };

  const printerLabel = () => {
    const status = devices();
    if (status === null || status === undefined) return 'Impresora: sin información';
    return status.mode === 'simulated' ? 'Impresora: simulada (modo desarrollo)' : 'Impresora: lista';
  };

  return (
    <footer class={styles.barra}>
      <span>
        <span class={styles.punto} classList={{ [styles.mal]: apiUp() === false }} />
        {apiUp() === false ? 'Sistema local sin responder' : 'Sistema local activo'}
      </span>
      <span title={devices()?.scale.message ?? undefined}>
        <span
          class={styles.punto}
          classList={{ [styles.pendiente]: devices()?.scale.connected !== true }}
        />
        {scaleLabel()}
      </span>
      <span title={devices()?.printer.message}>
        <span class={styles.punto} classList={{ [styles.pendiente]: devices()?.mode !== 'real' }} />
        {printerLabel()}
      </span>
      <span class={styles.spacer} />
      <span>Maná funciona sin internet — todo queda guardado en esta PC</span>
    </footer>
  );
};
