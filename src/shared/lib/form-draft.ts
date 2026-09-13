import { createSignal, onCleanup } from 'solid-js';

import { readStored, removeStored, savedAtOf, writeStored, type StoredKey } from '@/shared/lib/storage';

// Un formulario a medio llenar es un borrador personal, no un dato del
// negocio: vive en el navegador de quien lo escribió hasta que le da guardar.
// Seis formularios necesitan lo mismo, así que lo hace uno solo.
//
// Dos reglas que evitan sorpresas:
//   · No se guarda nada mientras el formulario esté igual a como se abrió. Sin
//     esto, abrir y cerrar un producto dejaría un «borrador» idéntico al
//     producto y el aviso saldría siempre.
//   · Al reabrir NO se aplica solo. Se avisa y la persona decide. Aplicarlo
//     solo pisaría en silencio un cambio que otro pudo hacer mientras tanto.

export interface FormDraft<T> {
  // Lo guardado, si hay algo distinto de los valores iniciales.
  saved: () => T | undefined;
  // Cuándo se guardó, para decir «de hace 12 minutos».
  savedAt: () => number | undefined;
  // Anota el estado actual del formulario (con debounce).
  track: (value: T) => void;
  // Tira el borrador: al guardar con éxito, o si la persona lo descarta.
  discard: () => void;
}

const DEBOUNCE_MS = 300;

export function createFormDraft<T>(
  key: StoredKey,
  decode: (data: unknown) => T | undefined,
  isPristine: (value: T) => boolean,
): FormDraft<T> {
  const [saved, setSaved] = createSignal<T | undefined>(readStored(key, decode));
  const [savedAt, setSavedAt] = createSignal<number | undefined>(savedAtOf(key));
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Si la persona ya tecleó algo en esta apertura. Recién abierto el
  // formulario está intacto, y sin esta marca ese primer estado borraría el
  // borrador que justo se está ofreciendo recuperar.
  let touched = false;

  function discard(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    touched = false;
    removeStored(key);
    setSaved(undefined);
    setSavedAt(undefined);
  }

  function track(value: T): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (isPristine(value)) {
        // Deshacer a mano lo tecleado borra el borrador: ya no hay nada que
        // recuperar. Pero el formulario recién abierto también está intacto y
        // ahí no se toca nada.
        if (!touched) return;
        removeStored(key);
        setSavedAt(undefined);
        return;
      }
      touched = true;
      writeStored(key, value);
      setSavedAt(savedAtOf(key));
    }, DEBOUNCE_MS);
  }

  // Cerrar el modal no debe disparar una escritura pendiente: lo que se guarda
  // es lo que la persona dejó, no lo que había 300 ms antes de cerrarlo.
  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  return { saved, savedAt, track, discard };
}

// «hace 12 minutos» en las palabras de la tienda, no una fecha completa: lo que
// importa es si el borrador es de recién o de ayer.
export function timeAgo(savedAt: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - savedAt) / 60_000);
  if (minutes < 1) return 'de recién';
  if (minutes === 1) return 'de hace un minuto';
  if (minutes < 60) return `de hace ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'de hace una hora';
  if (hours < 24) return `de hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'de ayer' : `de hace ${days} días`;
}
