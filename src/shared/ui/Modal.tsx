import {
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  Show,
  type Component,
  type JSX,
} from 'solid-js';

import { UnsavedChanges } from './UnsavedChanges';

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
// Pila de modales abiertos, en orden de apertura.
const openModals: symbol[] = [];

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
  // Si devuelve true, cerrar (✕, Esc o velo) pide confirmación en vez de
  // descartar lo tecleado. El aviso lo dibuja el propio modal.
  dirty?: () => boolean;
  // Cómo nombra esta pantalla lo que se perdería: «el producto», «la orden».
  dirtyLabel?: string;
  // Descartar es descartar: el que guarda borrador lo tira acá, si no al
  // reabrir le ofreceríamos recuperar justo lo que acaba de tirar.
  onDiscard?: () => void;
  onClose: () => void;
  children: JSX.Element;
}> = (props) => {
  const modalToken = Symbol('modal');
  const [confirmingDiscard, setConfirmingDiscard] = createSignal(false);
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

  // Todo intento de cerrar pasa por acá: con cambios sin guardar se pregunta
  // antes, y si no, se cierra derecho.
  function requestClose(): void {
    if (props.dirty?.() === true) {
      setConfirmingDiscard(true);
      return;
    }
    props.onClose();
  }

  // El navegador avisa por su cuenta al recargar o cerrar la pestaña mientras
  // haya algo sin guardar. El texto lo pone el navegador, no se puede elegir.
  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (props.dirty?.() !== true) return;
    event.preventDefault();
  }

  // Ctrl+Enter dispara el botón primario del footer desde cualquier campo.
  function clickFooterPrimary(): void {
    if (pieRef === undefined) return;
    const buttons = [...pieRef.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    buttons[buttons.length - 1]?.click();
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Con modales anidados (confirmar dentro de un detalle) solo responde el
    // de arriba: antes Esc cerraba los dos y los focus traps competían.
    if (openModals[openModals.length - 1] !== modalToken) return;
    // Esc cierra cualquier modal de la app, siempre.
    if (event.key === 'Escape') {
      event.stopPropagation();
      requestClose();
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
    openModals.push(modalToken);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', onBeforeUnload);
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
    const at = openModals.indexOf(modalToken);
    if (at >= 0) openModals.splice(at, 1);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (openedByKeyboard && opener instanceof HTMLElement && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }
  });

  return (
    <div
      class={styles.fondo}
      onClick={() => {
        if (props.dismissOnBackdrop !== false) requestClose();
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
          <button type="button" class={styles.cerrar} aria-label="Cerrar" onClick={requestClose}>
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

      <Show when={confirmingDiscard()}>
        <UnsavedChanges
          what={props.dirtyLabel ?? 'este formulario'}
          onDiscard={() => {
            setConfirmingDiscard(false);
            props.onDiscard?.();
            props.onClose();
          }}
          onKeepEditing={() => setConfirmingDiscard(false)}
        />
      </Show>
    </div>
  );
};
