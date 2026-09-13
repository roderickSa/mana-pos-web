import { createSignal, type Component } from 'solid-js';

import { formatSoles } from '@/shared/lib/money';
import type { UnitTicketLine } from '@/shared/types';
import { Keypad } from '@/shared/ui/Keypad';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';

// Cantidad exacta con keypad en pantalla (el número de la fila no era
// tocable). El teclado físico sigue funcionando en paralelo.
export const QuantityModal: Component<{
  line: UnitTicketLine;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}> = (props) => {
  const [value, setValue] = createSignal(String(props.line.quantity));

  // Tope de cordura: 13 dígitos en "cantidad" son un código de barras.
  const MAX_QUANTITY = 999;
  const parsed = () => {
    const quantity = Number.parseInt(value(), 10);
    return Number.isNaN(quantity) || quantity < 1 || quantity > MAX_QUANTITY ? null : quantity;
  };

  const priceCents = () => props.line.product.priceCents;

  function confirm(): void {
    const quantity = parsed();
    if (quantity === null) return;
    props.onConfirm(quantity);
  }

  return (
    <Modal
      size="sm"
      title={`Cantidad — ${props.line.product.name}`}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Volver
          </button>
        </div>
      }
    >
      <div class={forms.form}>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="cantidad-linea">
            Unidades ({formatSoles(priceCents())} c/u)
          </label>
          <input
            id="cantidad-linea"
            class={forms.input}
            type="text"
            inputmode="numeric"
            value={value()}
            onInput={(event) => setValue(event.currentTarget.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
            }}
            autofocus
          />
          <p class={forms.nota}>
            {parsed() === null
              ? 'Escribe cuántas unidades lleva (de 1 a 999).'
              : `La línea queda en ${formatSoles((parsed() ?? 0) * priceCents())}`}
          </p>
        </div>
        <Keypad
          value={value()}
          onChange={(next) => setValue(next.replace(/\D/g, ''))}
          confirmLabel="Aplicar cantidad"
          confirmDisabled={parsed() === null}
          onConfirm={confirm}
        />
      </div>
    </Modal>
  );
};
