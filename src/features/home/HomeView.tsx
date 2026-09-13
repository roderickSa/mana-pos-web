import { createResource, Show, type Component } from 'solid-js';
import { A } from '@solidjs/router';

import { searchSales } from '@/shared/api/sales';
import { getCashStatus } from '@/shared/api/cash';
import { searchProductsPage } from '@/shared/api/products';
import { getExpiring } from '@/shared/api/inventory';
import { listCustomers } from '@/shared/api/customers';
import { formatSoles } from '@/shared/lib/money';
import { currentUserName } from '@/shared/state/session';
import styles from './HomeView.module.css';

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// El pulso del negocio en una pantalla: lo que antes exigía recorrer Caja,
// Ventas, Inventario y Fiado. Solo la ve el dueño (App la monta con isOwner).
export const HomeView: Component = () => {
  const hoy = todayIso();
  const [ventas] = createResource(() =>
    searchSales({ from: hoy, to: hoy, method: '', status: '' }, 1, 1),
  );
  const [caja] = createResource(getCashStatus);
  const [bajoMinimo] = createResource(() => searchProductsPage('', 1, 1, true));
  const [porVencer] = createResource(getExpiring);
  const [deudores] = createResource(() => listCustomers('', true));

  const efectivoTurno = () => {
    const status = caja();
    return status !== undefined && status.open ? status.breakdown.currentCashCents : null;
  };

  const deudaTotal = () =>
    (deudores() ?? [])
      .filter((customer) => customer.balanceCents > 0)
      .reduce((sum, customer) => sum + customer.balanceCents, 0);
  const cantidadDeudores = () =>
    (deudores() ?? []).filter((customer) => customer.balanceCents > 0).length;

  return (
    <section class={styles.vista}>
      <header class={styles.encabezado}>
        <h2 class={styles.titulo}>Hola, {currentUserName()}</h2>
        <p class={styles.sub}>Así va Maná hoy</p>
      </header>

      <div class={styles.grilla}>
        <A href="/reportes/resumen" class={styles.tarjeta}>
          <span class={styles.etiqueta}>Venta de hoy</span>
          <span class={styles.cifra}>
            {formatSoles(ventas()?.summary.chargedTotalCents ?? 0)}
          </span>
          <span class={styles.detalle}>{ventas()?.summary.chargedCount ?? 0} tickets cobrados</span>
        </A>

        <A href="/caja" class={styles.tarjeta}>
          <span class={styles.etiqueta}>Caja</span>
          <Show
            when={efectivoTurno() !== null}
            fallback={
              <>
                <span class={styles.cifra}>—</span>
                <span class={styles.detalle}>turno cerrado</span>
              </>
            }
          >
            <span class={styles.cifra}>{formatSoles(efectivoTurno() ?? 0)}</span>
            <span class={styles.detalle}>efectivo del turno abierto</span>
          </Show>
        </A>

        <A
          class={styles.tarjeta}
          classList={{ [styles.alerta]: (bajoMinimo()?.total ?? 0) > 0 }}
          href="/productos"
        >
          <span class={styles.etiqueta}>Bajo mínimo</span>
          <span class={styles.cifra}>{bajoMinimo()?.total ?? 0}</span>
          <span class={styles.detalle}>productos por reponer</span>
        </A>

        <A
          class={styles.tarjeta}
          classList={{ [styles.alerta]: (porVencer()?.items.length ?? 0) > 0 }}
          href="/inventario/por-vencer"
        >
          <span class={styles.etiqueta}>Por vencer</span>
          <span class={styles.cifra}>{porVencer()?.items.length ?? 0}</span>
          <span class={styles.detalle}>productos cerca de su fecha</span>
        </A>

        <A href="/clientes/directorio" class={styles.tarjeta}>
          <span class={styles.etiqueta}>Fiado por cobrar</span>
          <span class={styles.cifra}>{formatSoles(deudaTotal())}</span>
          <span class={styles.detalle}>{cantidadDeudores()} clientes deben</span>
        </A>

        <A href="/vender" class={styles.tarjeta}>
          <span class={styles.etiqueta}>Mostrador</span>
          <span class={styles.cifraChica}>Ir a Vender →</span>
          <span class={styles.detalle}>F1 muestra los atajos</span>
        </A>
      </div>
    </section>
  );
};
