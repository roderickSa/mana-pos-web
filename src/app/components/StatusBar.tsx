import { type Component } from 'solid-js';

import { formatKg } from '@/shared/lib/money';
import { apiReachable, devicesStatus } from '@/shared/state/devices-status';
import styles from './StatusBar.module.css';

// El estado de equipos y de la API vienen del store compartido: la misma
// consulta de /devices/status sirve para saber que el sistema local responde.
export const StatusBar: Component = () => {
  const apiUp = apiReachable;
  const devices = devicesStatus;

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
      {/* En modo desarrollo los equipos simulados se marcan en ámbar: que
          nunca pase por estado normal si llega a la tienda. */}
      <span
        title={devices()?.scale.message ?? undefined}
        classList={{ [styles.dev]: devices()?.mode === 'simulated' }}
      >
        <span
          class={styles.punto}
          classList={{ [styles.pendiente]: devices()?.scale.connected !== true }}
        />
        {scaleLabel()}
      </span>
      <span
        title={devices()?.printer.message}
        classList={{ [styles.dev]: devices()?.mode === 'simulated' }}
      >
        <span class={styles.punto} classList={{ [styles.pendiente]: devices()?.mode !== 'real' }} />
        {printerLabel()}
      </span>
      <span class={styles.spacer} />
      <span>Maná funciona sin internet — todo queda guardado en esta PC</span>
    </footer>
  );
};
