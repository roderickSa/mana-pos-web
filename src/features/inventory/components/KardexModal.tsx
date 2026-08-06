import { createResource, For, Show, type Component } from 'solid-js';

import { getKardex } from '@/shared/api/inventory';
import { MOVEMENT_KIND_LABELS } from '@/shared/lib/labels';
import { formatDateTime } from '@/shared/lib/dates';
import type { ProductDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import styles from './KardexModal.module.css';

export const KardexModal: Component<{
  product: ProductDto;
  onClose: () => void;
  // Salto a la pestaña Kardex con el historial completo (si el padre lo cablea).
  onGoToKardex: (() => void) | null;
}> = (props) => {
  const [kardex] = createResource(() => getKardex(props.product.id));

  const unit = props.product.saleType === 'unit' ? 'unid.' : 'g';

  return (
    <Modal title={`Movimientos — ${props.product.name}`} onClose={props.onClose}>
      <Show when={kardex()} fallback={<p class={styles.cargando}>Cargando movimientos…</p>}>
        {(data) => (
          <>
            <p class={styles.actual}>
              Stock actual: <b>{data().currentQuantity}</b> {unit}
              <Show when={props.onGoToKardex !== null}>
                {' · '}
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'var(--mana-verde)',
                    'text-decoration': 'underline',
                    cursor: 'pointer',
                    padding: '0',
                    font: 'inherit',
                  }}
                  onClick={() => props.onGoToKardex?.()}
                >
                  ver todo en Kardex →
                </button>
              </Show>
            </p>
            <div class={styles.lista}>
              <For each={data().movements}>
                {(movement) => (
                  <div class={styles.movimiento}>
                    <span class={styles.tipo}>{MOVEMENT_KIND_LABELS[movement.kind] ?? movement.kind}</span>
                    <span
                      class={styles.cantidad}
                      classList={{ [styles.negativo]: movement.quantity < 0 }}
                    >
                      {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity} {unit}
                    </span>
                    <span class={styles.saldo} title="Saldo después del movimiento">
                      = {movement.balanceAfter} {unit}
                    </span>
                    <span class={styles.detalle}>
                      {formatDateTime(movement.createdAt)}
                      {' · '}
                      {movement.userId}
                      {movement.reason !== null ? ` · ${movement.reason}` : ''}
                    </span>
                  </div>
                )}
              </For>
              <Show when={data().movements.length === 0}>
                <p class={styles.cargando}>Este producto aún no tiene movimientos.</p>
              </Show>
            </div>
          </>
        )}
      </Show>
    </Modal>
  );
};
