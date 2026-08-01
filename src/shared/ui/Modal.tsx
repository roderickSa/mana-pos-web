import { onCleanup, onMount, type JSX, type Component } from 'solid-js';

import styles from './Modal.module.css';

export const Modal: Component<{
  title: string;
  onClose: () => void;
  children: JSX.Element;
}> = (props) => {
  // Esc cierra cualquier modal de la app, siempre.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      props.onClose();
    }
  }
  onMount(() => document.addEventListener('keydown', onKeyDown));
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  return (
    <div class={styles.fondo} onClick={props.onClose}>
      <div
        class={styles.modal}
        role="dialog"
        aria-label={props.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header class={styles.cabecera}>
          <h3>{props.title}</h3>
          <button type="button" class={styles.cerrar} aria-label="Cerrar" onClick={props.onClose}>
            ✕
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
};
