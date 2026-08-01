import { createEffect, createSignal, untrack, type Component, type JSX } from 'solid-js';

import styles from './DateField.module.css';

// Campo de fecha SIEMPRE en dd/mm/aaaa: el input nativo muestra el formato
// del sistema operativo (mm/dd/yyyy en Windows en inglés), así que se teclea
// enmascarado y el calendario nativo queda como apoyo en el botón.
function isoToDisplay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match === null ? '' : `${match[3]}/${match[2]}/${match[1]}`;
}

function displayToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (match === null) return null;
  const [, dd = '', mm = '', yyyy = ''] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const valid =
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(mm) - 1 &&
    date.getDate() === Number(dd);
  return valid ? `${yyyy}-${mm}-${dd}` : null;
}

function mask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export const DateField: Component<{
  // ISO yyyy-mm-dd o '' (vacío = sin fecha).
  value: string;
  onChange: (iso: string) => void;
  inputClass: string;
  style?: JSX.CSSProperties;
}> = (props) => {
  const [text, setText] = createSignal(isoToDisplay(props.value));
  let nativeRef: HTMLInputElement | undefined;

  // Si el valor cambia desde afuera (limpiar filtros, rangos rápidos), el
  // texto se realinea sin pisar lo que el usuario está tecleando a medias.
  createEffect(() => {
    const value = props.value;
    untrack(() => {
      const currentIso = displayToIso(text()) ?? '';
      if (value !== currentIso) setText(isoToDisplay(value));
    });
  });

  function onInput(raw: string): void {
    const masked = mask(raw);
    setText(masked);
    if (masked === '') {
      props.onChange('');
      return;
    }
    const iso = displayToIso(masked);
    if (iso !== null) props.onChange(iso);
  }

  function onBlur(): void {
    if (text() !== '' && displayToIso(text()) === null) {
      setText(isoToDisplay(props.value));
    }
  }

  function openPicker(): void {
    if (nativeRef === undefined) return;
    nativeRef.value = props.value;
    try {
      nativeRef.showPicker();
    } catch {
      nativeRef.focus();
    }
  }

  return (
    <div class={styles.campo} style={props.style}>
      <input
        class={`${props.inputClass} ${styles.texto}`}
        type="text"
        inputmode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={text()}
        onInput={(event) => onInput(event.currentTarget.value)}
        onBlur={onBlur}
      />
      <button
        type="button"
        class={styles.boton}
        aria-label="Abrir calendario"
        title="Abrir calendario"
        onClick={openPicker}
      >
        📅
      </button>
      <input
        ref={nativeRef}
        class={styles.oculto}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const iso = event.currentTarget.value;
          setText(isoToDisplay(iso));
          props.onChange(iso);
        }}
      />
    </div>
  );
};
