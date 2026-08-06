import { createUniqueId, onCleanup, onMount, Show, type JSX, type Component } from 'solid-js';

import styles from './Modal.module.css';

// Modalidad de entrada global: el foco solo se restaura al abridor cuando se
// navegó con teclado — un .focus() programático tras un toque re-enciende el
// anillo verde y el botón queda "seleccionado" en pantalla.
let lastInputWasKeyboard = false;
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Tab') lastInputWasKeyboard = true;
  },
  true,
);
document.addEventListener('pointerdown', () => (lastInputWasKeyboard = false), true);

// Escala única de anchos: cada modal declara el que corresponde a su
// contenido, nunca un número propio.
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  xl: styles.xl,
};

// Armazón común: header y footer fijos, SOLO el cuerpo scrollea. Así el botón
// de guardar nunca queda fuera de pantalla por más largo que sea el form.
export const Modal: Component<{
  title: string;
  // Línea secundaria bajo el título: chip de estado, metadatos.
  subtitle?: JSX.Element;
  // Acciones del header (p. ej. menú ⋯ para lo destructivo).
  headerActions?: JSX.Element;
  // Footer fijo con los botones; si no se pasa, el cuerpo va solo.
  footer?: JSX.Element;
  size?: ModalSize;
  // Formularios largos: un toque accidental fuera del cuadro NO debe
  // descartar lo tecleado — esos modales se cierran solo con ✕ o Esc.
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  children: JSX.Element;
}> = (props) => {
  let modalRef: HTMLDivElement | undefined;
  let pieRef: HTMLElement | undefined;
  const titleId = createUniqueId();
  // Al cerrar, el foco vuelve al elemento que abrió el modal (solo con
  // teclado — ver lastInputWasKeyboard).
  const opener = document.activeElement;
  const openedByKeyboard = lastInputWasKeyboard;

  function focusables(): HTMLElement[] {
    if (modalRef === undefined) return [];
    return [
      ...modalRef.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ];
  }

  // Ctrl+Enter dispara el botón primario del footer desde cualquier campo.
  function clickFooterPrimary(): void {
    if (pieRef === undefined) return;
    const buttons = [...pieRef.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    buttons[buttons.length - 1]?.click();
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Esc cierra cualquier modal de la app, siempre.
    if (event.key === 'Escape') {
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      clickFooterPrimary();
      return;
    }
    // Focus trap: Tab circula dentro del modal, nunca se escapa a la app.
    if (event.key === 'Tab') {
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !modalRef?.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !modalRef?.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    document.addEventListener('keydown', onKeyDown);
    // autofocus no dispara en montaje dinámico: foco manual al primer campo
    // relevante (o al primer control si no hay ninguno marcado).
    setTimeout(() => {
      if (modalRef === undefined || modalRef.contains(document.activeElement)) return;
      const marked = modalRef.querySelector<HTMLElement>('[autofocus]');
      const target =
        marked ?? modalRef.querySelector<HTMLElement>('input:not(:disabled), select, textarea');
      (target ?? focusables()[0])?.focus();
    }, 60);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown);
    if (openedByKeyboard && opener instanceof HTMLElement && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }
  });

  return (
    <div
      class={styles.fondo}
      onClick={() => {
        if (props.dismissOnBackdrop !== false) props.onClose();
      }}
    >
      <div
        ref={modalRef}
        class={`${styles.modal} ${SIZE_CLASS[props.size ?? 'md']}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header class={styles.cabecera}>
          <div class={styles.titulos}>
            <h3 id={titleId}>{props.title}</h3>
            <Show when={props.subtitle}>
              <div class={styles.subtitulo}>{props.subtitle}</div>
            </Show>
          </div>
          {props.headerActions}
          <button type="button" class={styles.cerrar} aria-label="Cerrar" onClick={props.onClose}>
            ✕
          </button>
        </header>
        <div class={styles.cuerpo}>{props.children}</div>
        <Show when={props.footer}>
          <footer ref={pieRef} class={styles.pie}>
            {props.footer}
          </footer>
        </Show>
      </div>
    </div>
  );
};
