import {createResource, createSignal, Match, Show, Switch, type Component } from 'solid-js';

import tabsCss from '@/shared/ui/tabla.module.css';
import { SuppliersTab } from './components/SuppliersTab';

import {getPurchaseOrder, listPurchaseOrders, type PurchaseOrderDto, type PurchaseOrderSummaryDto } from '@/shared/api/purchases';
import {beepError } from '@/shared/lib/sounds';
import tabla from '@/shared/ui/tabla.module.css';
import {OrdersList } from './components/OrdersList';
import { NewOrderForm } from './components/NewOrderForm';
import {OrderDetailModal } from './components/OrderDetailModal';

// Las órdenes se acumulan: una tienda que compra dos veces por semana llega a
// cientos en el año. Se piden de a página, como ventas y productos.
const PER_PAGE = 25;

const OrdersSection: Component = () => {
  const [mode, setMode] = createSignal<'lista' | 'nueva'>('lista');
  const [refresh, setRefresh] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [orders] = createResource(
    () => ({ refresh: refresh(), page: page() }),
    (params) => listPurchaseOrders(params.page, PER_PAGE),
  );
  const total = () => orders()?.total ?? 0;
  const lastPage = () => Math.max(1, Math.ceil(total() / PER_PAGE));
  const [detail, setDetail] = createSignal<{ order: PurchaseOrderDto; supplierName: string } | null>(
    null,
  );

  async function openDetail(summary: PurchaseOrderSummaryDto): Promise<void> {
    try {
      setDetail({ order: await getPurchaseOrder(summary.id), supplierName: summary.supplierName });
    } catch {
      beepError();
    }
  }

  return (
    <div class={tabla.vista}>
      <Show
        when={mode() === 'nueva'}
        fallback={
          <OrdersList
            orders={orders()?.items ?? []}
            total={total()}
            page={page()}
            lastPage={lastPage()}
            onPage={setPage}
            loading={orders.loading}
            onNew={() => setMode('nueva')}
            onOpen={openDetail}
          />
        }
      >
        <NewOrderForm
          onDone={() => {
            setMode('lista');
            setPage(1);
            setRefresh((value) => value + 1);
          }}
          onCancel={() => setMode('lista')}
        />
      </Show>

      <Show when={detail()}>
        {(current) => (
          <OrderDetailModal
            order={current().order}
            supplierName={current().supplierName}
            onClose={() => setDetail(null)}
            onChanged={(updated) => {
              setDetail({ order: updated, supplierName: current().supplierName });
              setRefresh((value) => value + 1);
            }}
          />
        )}
      </Show>
    </div>
  );
};

type PurchasesTab = 'ordenes' | 'proveedores';

export const PurchasesView: Component = () => {
  const [tab, setTab] = createSignal<PurchasesTab>('ordenes');
  return (
    <section class={tabsCss.contenedorTabs}>
      <nav class={tabsCss.subnav} aria-label="Secciones de compras">
        <button
          type="button"
          class={tabsCss.subtab}
          classList={{ [tabsCss.subtabActiva]: tab() === 'ordenes' }}
          onClick={() => setTab('ordenes')}
        >
          Órdenes
        </button>
        <button
          type="button"
          class={tabsCss.subtab}
          classList={{ [tabsCss.subtabActiva]: tab() === 'proveedores' }}
          onClick={() => setTab('proveedores')}
        >
          Proveedores
        </button>
      </nav>
      <Switch>
        <Match when={tab() === 'ordenes'}>
          <OrdersSection />
        </Match>
        <Match when={tab() === 'proveedores'}>
          <SuppliersTab />
        </Match>
      </Switch>
    </section>
  );
};
