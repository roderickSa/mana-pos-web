import { Show, type Component } from 'solid-js';

import { currentNotice } from '@/shared/state/notices';
import styles from './NoticeToast.module.css';

// Flotante y fuera del flujo: el aviso nunca estira el header ni empuja
// «Salir» y la hora fuera de la pantalla.
export const NoticeToast: Component = () => (
  <Show when={currentNotice() !== ''}>
    <div class={styles.toast} role="status" aria-live="polite">
      {currentNotice()}
    </div>
  </Show>
);
