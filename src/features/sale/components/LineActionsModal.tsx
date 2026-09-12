import { Show, type Component } from 'solid-js';

import { formatKg, formatSoles } from '@/shared/lib/money';
import type { TicketLine } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import styles from './LineActionsModal.module.css';

// Panel táctil de la línea: tap en la fila del ticket → botones grandes,
// en vez de acumular iconitos chicos por fila (review UI, punto 11).
export const LineActionsModal: Component<{
  line: TicketLine;
  onQuantity: () => void;
  onWeight: () => void;
  onDiscount: () => void;
  onRemove: () => void;
  onClose: () => void;
}> = (props) => {
  const line = props.line;

  return (
    <Modal size="sm" title={line.product.name} onClose={props.onClose}>
      <div class={styles.cuerpo}>
        <p class={styles.resumen}>
          {line.kind === 'weight'
            ? `${formatKg(line.grams)} · ${formatSoles(line.totalCents)}`
            : `${line.quantity} × ${formatSoles(line.product.priceCents)} · ${formatSoles(line.totalCents)}`}
          {props.line.discountCents > 0
            ? ` (dcto −${formatSoles(props.line.discountCents)})`
            : ''}
        </p>

        <Show when={line.kind === 'unit'}>
          <button type="button" class={styles.accion} onClick={props.onQuantity}>
            Cambiar cantidad…
          </button>
        </Show>
        <Show when={line.kind === 'weight'}>
          <button type="button" class={styles.accion} onClick={props.onWeight}>
            Corregir peso…
          </button>
        </Show>
        <button type="button" class={styles.accion} onClick={props.onDiscount}>
          Descuento a la línea…
        </button>

        {/* Quitar al final y separado: destructivo, lejos de los dedos. */}
        <button type="button" class={styles.quitar} onClick={props.onRemove}>
          Quitar del ticket
        </button>
      </div>
    </Modal>
  );
};
