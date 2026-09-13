import { Show, type Component } from 'solid-js';

import { timeAgo } from '@/shared/lib/form-draft';
import styles from './DraftBanner.module.css';

// Lo que se había tecleado y quedó a medias no se aplica solo al reabrir: se
// ofrece. Aplicarlo en silencio pisaría un cambio que otro pudo hacer mientras
// tanto, y la persona no se enteraría.
export const DraftBanner: Component<{
  savedAt: number | undefined;
  onRecover: () => void;
  onDiscard: () => void;
}> = (props) => (
  <Show when={props.savedAt}>
    {(savedAt) => (
      <div class={styles.franja} role="status">
        <span class={styles.texto}>Tenías cambios sin guardar {timeAgo(savedAt())}.</span>
        <button type="button" class={styles.accion} onClick={props.onRecover}>
          Recuperar
        </button>
        <button type="button" class={styles.descartar} onClick={props.onDiscard}>
          Descartar
        </button>
      </div>
    )}
  </Show>
);
