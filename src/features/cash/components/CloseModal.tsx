import {createSignal, Show, type Component } from 'solid-js';
import { Keypad } from '@/shared/ui/Keypad';

import {closeCash, type CloseResultDto } from '@/shared/api/cash';
import { ApiError, apiErrorMessage } from '@/shared/api/client';
import {DIME_MESSAGE, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import {showNotice } from '@/shared/state/notices';
import {beepError, beepSuccess } from '@/shared/lib/sounds';
import {Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';

export const CloseModal: Component<{
  onClosed: (result: CloseResultDto) => void;
  onClose: () => void;
}> = (props) => {
  const [counted, setCounted] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [note, setNote] = createSignal('');
  // El corte sigue siendo ciego: la nota solo aparece cuando el API detecta
  // descuadre (409 NOTE_REQUIRED) y recién ahí se revela la diferencia.
  const [noteRequired, setNoteRequired] = createSignal(false);

  async function save(): Promise<void> {
    const cents = solesInputToCents(counted());
    // El guard evita el doble-Enter que duplicaba cierres (visto el 31-jul).
    if (cents === null || saving()) return;
    if (!isDimeCents(cents)) {
      beepError();
      showNotice(DIME_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const result = await closeCash(cents, note().trim() === '' ? null : note().trim());
      beepSuccess();
      props.onClosed(result);
    } catch (cause) {
      beepError();
      if (cause instanceof ApiError && cause.code === 'NOTE_REQUIRED') {
        setNoteRequired(true);
      }
      setError(apiErrorMessage(cause, 'No se pudo cerrar la caja.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Cerrar caja — arqueo" onClose={props.onClose}>
      <div class={forms.form}>
        <p class={forms.nota}>
          Cuenta el efectivo del cajón y escríbelo. El sistema compara contra lo esperado y registra
          la diferencia (corte ciego: no te mostramos el esperado hasta después).
        </p>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Efectivo contado S/</span>
          <input
            class={forms.input}
            type="number"
            step="0.10"
            min="0"
            value={counted()}
            onInput={(event) => setCounted(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && void save()}
            autofocus
          />
          <Keypad value={counted()} onChange={setCounted} allowDecimal />
        </div>
        <Show when={noteRequired()}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Motivo del descuadre (obligatorio)</span>
            <input
              class={forms.input}
              value={note()}
              placeholder="p. ej. faltó sencillo del vuelto"
              onInput={(event) => setNote(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && void save()}
            />
          </div>
        </Show>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={forms.primario}
            disabled={saving()}
            onClick={() => void save()}
          >
            Cerrar caja
          </button>
        </div>
      </div>
    </Modal>
  );
};
