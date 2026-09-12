import {createSignal, Show, type Component } from 'solid-js';

import {registerCashMovement } from '@/shared/api/cash';
import {apiErrorMessage } from '@/shared/api/client';
import {DIME_MESSAGE, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import {showNotice } from '@/shared/state/notices';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import {Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import {MOVEMENT_LABELS } from './cash.helpers';

export const MovementModal: Component<{
  movementKind: 'withdrawal' | 'expense' | 'deposit';
  onDone: () => void;
  onClose: () => void;
}> = (props) => {
  const [amount, setAmount] = createSignal('');
  const [concept, setConcept] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  async function save(): Promise<void> {
    if (saving()) return;
    const cents = solesInputToCents(amount());
    if (cents === null || cents <= 0 || concept().trim() === '') return;
    if (!isDimeCents(cents)) {
      setError(DIME_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const result = await registerCashMovement(props.movementKind, cents, concept().trim());
      beepSuccess();
      showNotice(
        `${MOVEMENT_LABELS[props.movementKind]} de ${formatSoles(cents)} registrado — quedan ${formatSoles(result.currentCashCents)} en caja`,
      );
      props.onDone();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo registrar.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={
        props.movementKind === 'withdrawal'
          ? 'Retiro de efectivo'
          : props.movementKind === 'expense'
            ? 'Gasto desde caja'
            : 'Ingreso de efectivo (refuerzo de fondo)'
      }
      onClose={props.onClose}
    >
      <div class={forms.form}>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Monto S/</span>
            <input
              class={forms.input}
              type="number"
              step="0.10"
              min="0"
              value={amount()}
              onInput={(event) => setAmount(event.currentTarget.value)}
              autofocus
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Concepto</span>
            <input
              class={forms.input}
              value={concept()}
              onInput={(event) => setConcept(event.currentTarget.value)}
              placeholder={
                props.movementKind === 'withdrawal'
                  ? 'p. ej. a la bóveda'
                  : props.movementKind === 'expense'
                    ? 'p. ej. hielo, flete'
                    : 'p. ej. sencillo para vuelto'
              }
              onKeyDown={(event) => event.key === 'Enter' && void save()}
            />
          </div>
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={saving()} onClick={() => void save()}>
            Registrar
          </button>
        </div>
      </div>
    </Modal>
  );
};
