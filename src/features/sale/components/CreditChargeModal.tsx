import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';

import { listCustomers, type CustomerAccountDto } from '@/shared/api/customers';
import { formatSoles } from '@/shared/lib/money';
import { Modal } from '@/shared/ui/Modal';
import styles from './CreditChargeModal.module.css';

// Fiado: elegir cliente y confirmar. El límite lo valida el servidor;
// aquí solo se muestra el disponible para decidir rápido.
export const CreditChargeModal: Component<{
  totalCents: number;
  // Cliente ya elegido para la venta: se preselecciona (misma persona).
  initialCustomerId: string | null;
  onConfirm: (customerId: string) => Promise<void>;
  onClose: () => void;
}> = (props) => {
  const [query, setQuery] = createSignal('');
  const [selected, setSelected] = createSignal<CustomerAccountDto | null>(null);
  const [charging, setCharging] = createSignal(false);
  const [error, setError] = createSignal('');

  const [customers] = createResource(query, (search) => listCustomers(search, false));

  createEffect(() => {
    if (selected() !== null || props.initialCustomerId === null) return;
    const match = (customers() ?? []).find((customer) => customer.id === props.initialCustomerId);
    if (match !== undefined) setSelected(match);
  });

  async function confirm(): Promise<void> {
    const customer = selected();
    if (customer === null || charging()) return;
    setCharging(true);
    setError('');
    await props.onConfirm(customer.id);
    setCharging(false);
  }

  return (
    <Modal
      size="md"
      title={`Fiar ${formatSoles(props.totalCents)}`}
      onClose={props.onClose}
      footer={
        <div class={styles.acciones}>
          <button type="button" class={styles.cancelar} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={styles.confirmar}
            disabled={selected() === null || charging()}
            onClick={() => void confirm()}
          >
            {charging()
              ? 'Registrando…'
              : selected() === null
                ? 'Elige un cliente'
                : `Fiar a ${selected()?.name}`}
          </button>
        </div>
      }
    >
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
            {(customer) => {
              const alcanza = customer.availableCents >= props.totalCents;
              return (
                <button
                  type="button"
                  class={styles.cliente}
                  classList={{
                    [styles.seleccionado]: selected()?.id === customer.id,
                    [styles.sinCredito]: !alcanza,
                  }}
                  onClick={() => setSelected(customer)}
                >
                  <span class={styles.nombre}>{customer.name}</span>
                  <span class={styles.detalle}>
                    Debe {formatSoles(customer.balanceCents)} · disponible{' '}
                    {formatSoles(customer.availableCents)}
                    {!alcanza ? ' — no le alcanza' : ''}
                  </span>
                </button>
              );
            }}
          </For>
          <Show when={!customers.loading && (customers() ?? []).length === 0}>
            <p class={styles.vacio}>No hay clientes con ese nombre. Créalo en el módulo Clientes.</p>
          </Show>
        </div>

        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>

      </div>
    </Modal>
  );
};
