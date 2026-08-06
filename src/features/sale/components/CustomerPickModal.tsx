import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { listCustomers } from '@/shared/api/customers';
import { formatSoles } from '@/shared/lib/money';
import { Modal } from '@/shared/ui/Modal';
import type { TicketCustomer } from '@/features/sale/state/ticket';
import styles from './CreditChargeModal.module.css';

// Poner la venta a nombre de un cliente (cualquiera, no solo fiado): la misma
// libreta de clientes, sin chequeo de crédito porque aquí no se fía nada.
export const CustomerPickModal: Component<{
  onPick: (customer: TicketCustomer) => void;
  onClear: () => void;
  hasCustomer: boolean;
  onClose: () => void;
}> = (props) => {
  const [query, setQuery] = createSignal('');
  const [customers] = createResource(query, (search) => listCustomers(search, false));

  return (
    <Modal title="Cliente de la venta" onClose={props.onClose}>
      <div class={styles.cuerpo}>
        <input
          class={styles.buscador}
          type="text"
          placeholder="Buscar cliente…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          autofocus
        />

        <div class={styles.lista}>
          <For each={customers() ?? []}>
            {(customer) => (
              <button
                type="button"
                class={styles.cliente}
                onClick={() => props.onPick({ id: customer.id, name: customer.name })}
              >
                <span class={styles.nombre}>{customer.name}</span>
                <Show when={customer.balanceCents > 0}>
                  <span class={styles.detalle}>Debe {formatSoles(customer.balanceCents)}</span>
                </Show>
              </button>
            )}
          </For>
          <Show when={!customers.loading && (customers() ?? []).length === 0}>
            <p class={styles.vacio}>No hay clientes con ese nombre. Créalo en el módulo Clientes.</p>
          </Show>
        </div>

        <div class={styles.acciones}>
          <Show when={props.hasCustomer}>
            <button type="button" class={styles.cancelar} onClick={props.onClear}>
              Quitar cliente
            </button>
          </Show>
          <button type="button" class={styles.cancelar} onClick={props.onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
};
